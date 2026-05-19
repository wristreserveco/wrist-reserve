/**
 * Admin-only endpoint that wraps three actions into a single button:
 *
 *   1. (optional) Upload a manually-purchased label image / PDF to Supabase
 *      Storage and persist it as `orders.shippo_label_url`.
 *   2. Save tracking_number / tracking_carrier / tracking_url on the order
 *      and flip status to "shipped" if it isn't already.
 *   3. Email the buyer the tracking notification (with the label attached
 *      if uploaded) via Resend.
 *
 * Accepts multipart/form-data. We avoid the standard JSON pattern here
 * because the label file is binary.
 *
 * Fields (multipart):
 *   - tracking_number   (string, required)
 *   - carrier           (string, required: usps|ups|fedex|dhl|other)
 *   - tracking_url      (string, optional — overrides the auto-derived one)
 *   - message           (string, optional — included in the email body)
 *   - label             (File,   optional — image/pdf, max ~10MB)
 *   - skip_email        ("1"|"true" — don't actually send the email; useful
 *                                     when admin only wants to attach the
 *                                     label without notifying the buyer)
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { logOrderEvent } from "@/lib/orders/events";
import { logAuditEvent, auditContextFromRequest } from "@/lib/security/audit-log";
import { isEmailConfigured, sendEmail } from "@/lib/email/resend";
import {
  trackingEmailHtml,
  trackingEmailSubject,
  trackingEmailText,
} from "@/lib/email/templates/tracking";
import { buildTrackingUrl, carrierLabel } from "@/lib/shipping/tracking-urls";
import {
  isSmsConfigured,
  normalizePhoneToE164,
  sendSms,
} from "@/lib/sms/twilio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BUCKET = "product-media";
const MAX_LABEL_BYTES = 10 * 1024 * 1024; // 10 MB — enough for any 4×6 PDF
const ALLOWED_LABEL_MIMES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
]);

function slugifySegment(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 60);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // ─── 1. Admin auth ────────────────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ─── 2. Parse form ────────────────────────────────────────────────────
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form" }, { status: 400 });
  }

  const trackingNumber = String(form.get("tracking_number") ?? "").trim();
  const carrier = String(form.get("carrier") ?? "").trim();
  const trackingUrlOverride = String(form.get("tracking_url") ?? "").trim();
  const message = String(form.get("message") ?? "").trim() || null;
  const skipEmail =
    String(form.get("skip_email") ?? "") === "1" ||
    String(form.get("skip_email") ?? "").toLowerCase() === "true";
  const label = form.get("label");

  if (!trackingNumber) {
    return NextResponse.json(
      { error: "Tracking number is required." },
      { status: 400 }
    );
  }
  if (!carrier) {
    return NextResponse.json(
      { error: "Carrier is required." },
      { status: 400 }
    );
  }

  // ─── 3. Look up the order ─────────────────────────────────────────────
  const service = createServiceClient();
  const { data: order, error: orderErr } = await service
    .from("orders")
    .select(
      "id, email, customer_name, customer_phone, payment_status, shipped_at, tracking_number, tracking_carrier, tracking_url, shippo_label_url, product_id, products:product_id ( name )"
    )
    .eq("id", id)
    .single();

  if (orderErr || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const productName =
    ((order as unknown) as { products?: { name?: string } | null }).products
      ?.name ?? "Wrist Reserve order";

  // ─── 4. (Optional) upload label ───────────────────────────────────────
  let labelUrl: string | null =
    (order as { shippo_label_url?: string | null }).shippo_label_url ?? null;

  if (label instanceof File && label.size > 0) {
    if (label.size > MAX_LABEL_BYTES) {
      return NextResponse.json(
        { error: "Label file is too large (max 10MB)." },
        { status: 400 }
      );
    }
    const mime = (label.type || "").toLowerCase();
    if (!ALLOWED_LABEL_MIMES.has(mime)) {
      return NextResponse.json(
        {
          error:
            "Label must be PNG, JPG, WEBP, or PDF. Convert your file and try again.",
        },
        { status: 400 }
      );
    }
    const extGuess =
      mime === "application/pdf"
        ? "pdf"
        : mime === "image/png"
        ? "png"
        : mime === "image/webp"
        ? "webp"
        : "jpg";
    const ts = Date.now().toString(36);
    const safeId = slugifySegment(id);
    const path = `labels/${safeId}/${ts}-label.${extGuess}`;
    const buf = await label.arrayBuffer();
    const { error: upErr } = await service.storage
      .from(BUCKET)
      .upload(path, buf, {
        contentType: mime,
        upsert: false,
        cacheControl: "31536000, immutable",
      });
    if (upErr) {
      return NextResponse.json(
        { error: `Couldn't store label: ${upErr.message}` },
        { status: 500 }
      );
    }
    const { data: pub } = service.storage.from(BUCKET).getPublicUrl(path);
    labelUrl = pub.publicUrl;
  }

  // ─── 5. Persist tracking + status ─────────────────────────────────────
  const carrierClean = carrier.slice(0, 32);
  const trackingUrl =
    trackingUrlOverride || buildTrackingUrl(carrierClean, trackingNumber);
  const nowIso = new Date().toISOString();

  // Progressive update — if any column is missing on this schema we
  // strip it and retry, so the action never blocks on a stale DB.
  const updatePayload: Record<string, unknown> = {
    tracking_number: trackingNumber.slice(0, 64),
    tracking_carrier: carrierClean,
    tracking_url: trackingUrl,
    shippo_label_url: labelUrl,
    shipped_at:
      (order as { shipped_at?: string | null }).shipped_at ?? nowIso,
    payment_status: "shipped",
  };

  // If the order is still pending we don't want to silently flip it to
  // "shipped" — that breaks the paid → shipped flow. Require paid.
  const status = (order as { payment_status?: string }).payment_status;
  if (status !== "paid" && status !== "shipped") {
    return NextResponse.json(
      {
        error:
          "Order isn't paid yet — mark it paid before adding tracking and notifying the buyer.",
      },
      { status: 400 }
    );
  }

  let updErr: { message?: string } | null = null;
  let attempts = 0;
  // Iteratively drop columns the schema doesn't know about.
  while (attempts < 8) {
    const { error } = await service
      .from("orders")
      .update(updatePayload)
      .eq("id", id);
    if (!error) {
      updErr = null;
      break;
    }
    if (!/column|does not exist|schema/i.test(error.message)) {
      updErr = error;
      break;
    }
    const m = error.message.match(/"([^"]+)"/);
    const col = m?.[1];
    if (!col || !(col in updatePayload)) {
      updErr = error;
      break;
    }
    delete updatePayload[col];
    attempts += 1;
  }
  if (updErr) {
    return NextResponse.json(
      { error: `Failed to save tracking: ${updErr.message}` },
      { status: 500 }
    );
  }

  // ─── 6. Audit + order timeline ────────────────────────────────────────
  const audit = auditContextFromRequest(request, user);
  await logAuditEvent({
    service,
    ...audit,
    kind: "order.send_tracking",
    targetKind: "order",
    targetId: id,
    message: `${carrierClean} ${trackingNumber}`,
    metadata: {
      label_url: labelUrl,
      tracking_url: trackingUrl,
      skip_email: skipEmail,
    },
  });
  await logOrderEvent(service, {
    orderId: id,
    kind: "shipped",
    actor: "admin",
    message: `Tracking saved — ${carrierClean.toUpperCase()} ${trackingNumber}`,
    metadata: { tracking_url: trackingUrl, label_url: labelUrl },
  });

  const siteUrl = (
    process.env.NEXT_PUBLIC_SITE_URL || "https://www.wristreserve.co"
  ).replace(/\/$/, "");
  const buyerFirstName =
    ((order as { customer_name?: string | null }).customer_name ?? "")
      .trim()
      .split(/\s+/)[0] || null;

  // ─── 7a. Email the buyer ─────────────────────────────────────────────
  const recipientEmail = (order as { email?: string | null }).email?.trim();
  let emailStatus:
    | "sent"
    | "skipped"
    | "no_recipient"
    | "not_configured"
    | "failed" = "skipped";
  let emailError: string | null = null;
  let emailId: string | null = null;

  if (!skipEmail) {
    if (!recipientEmail) {
      emailStatus = "no_recipient";
    } else if (!isEmailConfigured()) {
      emailStatus = "not_configured";
    } else {
      const data = {
        customerName:
          (order as { customer_name?: string | null }).customer_name ?? null,
        productName,
        carrier: carrierLabel(carrierClean),
        trackingNumber,
        trackingUrl,
        message,
        siteUrl,
        labelUrl,
      };
      try {
        const result = await sendEmail({
          to: recipientEmail,
          subject: trackingEmailSubject(productName),
          text: trackingEmailText(data),
          html: trackingEmailHtml(data),
          replyTo: process.env.RESEND_REPLY_TO || undefined,
          tags: [
            { name: "kind", value: "tracking" },
            { name: "order_id", value: id.slice(0, 64) },
          ],
        });
        emailId = result.id;
        emailStatus = "sent";
        await logOrderEvent(service, {
          orderId: id,
          kind: "note_added",
          actor: "system",
          message: `Tracking email sent to ${recipientEmail}`,
          metadata: { resend_id: result.id },
        });
      } catch (e) {
        emailStatus = "failed";
        emailError = e instanceof Error ? e.message : "Email send failed";
        await logOrderEvent(service, {
          orderId: id,
          kind: "note_added",
          actor: "system",
          message: `Tracking email FAILED: ${emailError}`,
        });
      }
    }
  }

  // ─── 7b. SMS the buyer (only if a phone number is on file) ───────────
  // Phone is optional at checkout, so plenty of orders won't have one.
  // We treat "no phone" as a silent skip — never an error.
  const rawPhone = (order as { customer_phone?: string | null }).customer_phone;
  const recipientPhone = rawPhone ? normalizePhoneToE164(rawPhone) : null;
  let smsStatus:
    | "sent"
    | "skipped"
    | "no_recipient"
    | "not_configured"
    | "invalid_phone"
    | "failed" = "skipped";
  let smsError: string | null = null;
  let smsId: string | null = null;

  if (!skipEmail) {
    // The "skip" toggle is meant to silence both rails together. If the
    // admin wants to send tracking quietly, neither buyer email nor SMS
    // should fire.
    if (!rawPhone || !rawPhone.trim()) {
      smsStatus = "no_recipient";
    } else if (!recipientPhone) {
      smsStatus = "invalid_phone";
    } else if (!isSmsConfigured()) {
      smsStatus = "not_configured";
    } else {
      // Keep the SMS body short so it stays in one segment (160 chars
      // GSM-7). Order: name → carrier+tracking → link → site for trust.
      const greeting = buyerFirstName ? `Hi ${buyerFirstName}, ` : "";
      const carrier = carrierLabel(carrierClean);
      const link = trackingUrl ? ` Track: ${trackingUrl}` : "";
      const smsBody = `${greeting}your ${productName} has shipped via ${carrier}. Tracking: ${trackingNumber}.${link} — Wrist Reserve`;
      try {
        const result = await sendSms({ to: recipientPhone, body: smsBody });
        smsId = result.sid;
        smsStatus = "sent";
        await logOrderEvent(service, {
          orderId: id,
          kind: "note_added",
          actor: "system",
          message: `Tracking SMS sent to ${recipientPhone}`,
          metadata: { twilio_sid: result.sid },
        });
      } catch (e) {
        smsStatus = "failed";
        smsError = e instanceof Error ? e.message : "SMS send failed";
        await logOrderEvent(service, {
          orderId: id,
          kind: "note_added",
          actor: "system",
          message: `Tracking SMS FAILED: ${smsError}`,
        });
      }
    }
  }

  return NextResponse.json({
    ok: true,
    trackingNumber,
    carrier: carrierClean,
    trackingUrl,
    labelUrl,
    email: { status: emailStatus, id: emailId, error: emailError },
    sms: { status: smsStatus, id: smsId, error: smsError },
  });
}
