/**
 * Email templates for shipment notifications. Kept in a single file so the
 * plain-text + HTML versions stay in lockstep (every email service needs
 * both for the best deliverability).
 *
 * Inline CSS only — Gmail, Outlook, Apple Mail all strip <style> tags from
 * external blocks. The HTML is intentionally minimal, mobile-first, and
 * works without external assets so it renders the same in every client.
 */

export interface TrackingEmailData {
  customerName: string | null;
  productName: string;
  carrier: string;
  trackingNumber: string;
  trackingUrl: string | null;
  /** Optional plain-text message from the seller to personalize. */
  message?: string | null;
  /** Site URL for footer / unsubscribe placeholders. */
  siteUrl: string;
  /** Public URL to the label PDF/image — if present we add a "View label"
   *  link so the buyer can see proof their package was prepared. */
  labelUrl?: string | null;
}

const BRAND = "Wrist Reserve";
const GOLD = "#c8a14a"; // matches site palette

export function trackingEmailSubject(productName: string): string {
  return `Your ${productName} is on the way · ${BRAND}`;
}

export function trackingEmailText(d: TrackingEmailData): string {
  const lines: string[] = [];
  lines.push(d.customerName ? `Hi ${d.customerName.split(" ")[0]},` : "Hi,");
  lines.push("");
  lines.push(
    `Good news — your ${d.productName} has shipped via ${d.carrier}.`
  );
  lines.push("");
  lines.push(`Tracking number: ${d.trackingNumber}`);
  if (d.trackingUrl) {
    lines.push(`Track it here: ${d.trackingUrl}`);
  }
  if (d.labelUrl) {
    lines.push(`Shipping label: ${d.labelUrl}`);
  }
  if (d.message?.trim()) {
    lines.push("");
    lines.push(d.message.trim());
  }
  lines.push("");
  lines.push(
    "If anything looks off — wrong address, missed handoff, anything — just reply to this email."
  );
  lines.push("");
  lines.push(`— ${BRAND}`);
  lines.push(d.siteUrl);
  return lines.join("\n");
}

export function trackingEmailHtml(d: TrackingEmailData): string {
  const firstName = d.customerName
    ? d.customerName.split(" ")[0].slice(0, 40)
    : null;
  const safeMessage = d.message?.trim()
    ? d.message
        .trim()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\n/g, "<br />")
    : null;
  const trackButton = d.trackingUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 24px 0;">
         <tr>
           <td bgcolor="${GOLD}" style="border-radius: 4px;">
             <a href="${d.trackingUrl}" target="_blank" style="display: inline-block; padding: 14px 32px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; font-size: 12px; font-weight: 600; letter-spacing: 0.22em; text-transform: uppercase; color: #0a0a0a; text-decoration: none;">
               Track shipment
             </a>
           </td>
         </tr>
       </table>`
    : "";

  const labelRow = d.labelUrl
    ? `<p style="margin: 12px 0 0 0; font-size: 13px; color: #a3a3a3;">
         Want proof? <a href="${d.labelUrl}" target="_blank" style="color: ${GOLD}; text-decoration: underline;">View shipping label</a>.
       </p>`
    : "";

  const messageBlock = safeMessage
    ? `<div style="margin: 24px 0; padding: 16px; background: #111111; border-left: 2px solid ${GOLD}; font-size: 14px; line-height: 1.55; color: #d4d4d4;">
         ${safeMessage}
       </div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${trackingEmailSubject(d.productName)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #050505; color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #050505;">
    <tr>
      <td align="center" style="padding: 32px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="width: 100%; max-width: 560px; background-color: #0a0a0a; border: 1px solid #1f1f1f; border-radius: 8px;">
          <tr>
            <td style="padding: 32px 32px 16px 32px; text-align: center; border-bottom: 1px solid #1f1f1f;">
              <p style="margin: 0; font-size: 10px; letter-spacing: 0.28em; text-transform: uppercase; color: ${GOLD};">${BRAND}</p>
              <h1 style="margin: 12px 0 0 0; font-family: Georgia, 'Times New Roman', serif; font-size: 24px; font-weight: 400; color: #ffffff; line-height: 1.3;">
                Your watch is on the way
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 28px 32px;">
              <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #e5e5e5;">
                ${firstName ? `Hi ${firstName},` : "Hi,"}
              </p>
              <p style="margin: 0 0 8px 0; font-size: 15px; line-height: 1.6; color: #e5e5e5;">
                Good news — your <strong style="color: #ffffff;">${d.productName}</strong> has shipped via <strong style="color: #ffffff;">${d.carrier}</strong>.
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 20px 0 0 0; width: 100%; background: #111111; border: 1px solid #1f1f1f; border-radius: 4px;">
                <tr>
                  <td style="padding: 16px 20px;">
                    <p style="margin: 0; font-size: 10px; letter-spacing: 0.22em; text-transform: uppercase; color: #737373;">Tracking number</p>
                    <p style="margin: 6px 0 0 0; font-family: 'SF Mono', Menlo, Consolas, monospace; font-size: 15px; color: #ffffff; word-break: break-all;">
                      ${d.trackingNumber}
                    </p>
                  </td>
                </tr>
              </table>
              ${trackButton}
              ${labelRow}
              ${messageBlock}
              <p style="margin: 24px 0 0 0; font-size: 13px; line-height: 1.6; color: #a3a3a3;">
                If anything looks off — wrong address, missed handoff, anything — just hit reply.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 16px 32px 32px 32px; text-align: center; border-top: 1px solid #1f1f1f;">
              <p style="margin: 0; font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase; color: #525252;">
                <a href="${d.siteUrl}" style="color: #737373; text-decoration: none;">${d.siteUrl.replace(/^https?:\/\//, "")}</a>
              </p>
              <p style="margin: 8px 0 0 0; font-size: 11px; color: #525252;">
                Affordable timepieces. Private sales. Discreet worldwide shipping.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
