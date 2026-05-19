/**
 * Thin Resend client. We deliberately don't use the official SDK so we keep
 * the bundle tiny and stay on the Node runtime without polyfills.
 *
 * Required env (server-side only):
 *   RESEND_API_KEY        — `re_...` token from resend.com
 *   RESEND_FROM_EMAIL     — e.g. "Wrist Reserve <hello@wristreserve.co>"
 *
 * When the key is missing we deliberately throw a typed error so callers can
 * either surface the gap or fall back gracefully (see `isEmailConfigured`).
 */

const API = "https://api.resend.com/emails";

export interface EmailAttachment {
  /** Display filename on the recipient side. */
  filename: string;
  /** Either a base64-encoded string OR a URL Resend can fetch. */
  content?: string;
  /** Public URL the file lives at; Resend will fetch and attach it. */
  path?: string;
  /** MIME type, e.g. "image/png", "application/pdf". */
  contentType?: string;
}

export interface SendEmailArgs {
  to: string | string[];
  subject: string;
  /** Plain-text body. Always include — it's the fallback for clients that
   *  refuse HTML or for high-trust spam filters. */
  text: string;
  /** Optional HTML body. Should be self-contained (inline CSS). */
  html?: string;
  /** Optional reply-to header so support replies don't go to a noreply. */
  replyTo?: string | string[];
  attachments?: EmailAttachment[];
  /** Override sender (otherwise we use RESEND_FROM_EMAIL). */
  from?: string;
  /** Resend tags for analytics; recommended at least { name: 'kind', value: 'tracking' }. */
  tags?: { name: string; value: string }[];
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL);
}

export class EmailNotConfiguredError extends Error {
  constructor() {
    super(
      "Email service not configured. Set RESEND_API_KEY and RESEND_FROM_EMAIL."
    );
    this.name = "EmailNotConfiguredError";
  }
}

export async function sendEmail(args: SendEmailArgs): Promise<{ id: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const defaultFrom = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !defaultFrom) throw new EmailNotConfiguredError();

  const body: Record<string, unknown> = {
    from: args.from || defaultFrom,
    to: Array.isArray(args.to) ? args.to : [args.to],
    subject: args.subject,
    text: args.text,
  };
  if (args.html) body.html = args.html;
  if (args.replyTo)
    body.reply_to = Array.isArray(args.replyTo) ? args.replyTo : [args.replyTo];
  if (args.attachments?.length) body.attachments = args.attachments;
  if (args.tags?.length) body.tags = args.tags;

  const res = await fetch(API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Resend failed (${res.status}): ${text.slice(0, 400)}`);
  }
  const json = (await res.json()) as { id?: string };
  return { id: json.id ?? "unknown" };
}
