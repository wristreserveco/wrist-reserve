/**
 * Thin Twilio client. We deliberately don't pull in the official SDK so
 * we keep the cold-start lean and avoid native bindings on Vercel.
 *
 * Required env (server-side only):
 *   TWILIO_ACCOUNT_SID         "AC..." identifier from twilio.com/console
 *   TWILIO_AUTH_TOKEN          secret token paired with the SID
 *   TWILIO_FROM_NUMBER         E.164 phone we send from, e.g. "+15555550100"
 *
 * Optional:
 *   TWILIO_MESSAGING_SERVICE_SID  preferred over FROM_NUMBER if set —
 *                                 Twilio picks the best long-code / short-
 *                                 code / toll-free number from the pool.
 *
 * Failure modes:
 *   - Missing env  → throws EmailSimilarError (caller logs + continues).
 *   - Invalid phone → 4xx from Twilio with descriptive message.
 *   - Network error → throws; caller logs to order_events.
 */

export function isSmsConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      (process.env.TWILIO_FROM_NUMBER || process.env.TWILIO_MESSAGING_SERVICE_SID)
  );
}

export class SmsNotConfiguredError extends Error {
  constructor() {
    super(
      "SMS service not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER (or TWILIO_MESSAGING_SERVICE_SID)."
    );
    this.name = "SmsNotConfiguredError";
  }
}

export interface SendSmsArgs {
  /** Recipient in any reasonable format; we normalize to E.164 below. */
  to: string;
  /** Plain-text body. Twilio splits over multiple segments at 160 chars
   *  for GSM-7 / 70 chars for UCS-2. Keep it short to avoid splits. */
  body: string;
}

/**
 * Convert a free-form phone string into E.164. Handles the most common
 * US formats people type at checkout: "(555) 123-4567", "555-123-4567",
 * "5551234567", "+1 555 123 4567". For anything that already starts with
 * a "+" we trust the country code.
 */
export function normalizePhoneToE164(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Already E.164.
  if (/^\+\d{8,15}$/.test(trimmed)) return trimmed;

  // Strip everything except digits.
  const digits = trimmed.replace(/\D+/g, "");
  if (digits.length === 0) return null;

  // US 10-digit number → prepend +1.
  if (digits.length === 10) return `+1${digits}`;
  // US 11-digit with country code.
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  // International with leading 0 / "00" — strip the 00 and prepend "+".
  if (digits.length >= 11 && digits.length <= 15) {
    const withoutTrunk = digits.replace(/^00/, "");
    return `+${withoutTrunk}`;
  }
  return null;
}

interface TwilioMessageResponse {
  sid: string;
  status: string;
  error_code?: string | null;
  error_message?: string | null;
}

export async function sendSms(args: SendSmsArgs): Promise<{ sid: string }> {
  if (!isSmsConfigured()) throw new SmsNotConfiguredError();

  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const token = process.env.TWILIO_AUTH_TOKEN!;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;
  const msSid = process.env.TWILIO_MESSAGING_SERVICE_SID;

  const to = normalizePhoneToE164(args.to);
  if (!to) {
    throw new Error(
      `Phone number "${args.to}" couldn't be parsed into E.164 format.`
    );
  }

  const params = new URLSearchParams();
  params.set("To", to);
  // Trim message body so we don't blow past Twilio's hard 1600-char cap.
  params.set("Body", args.body.slice(0, 1500));
  if (msSid) {
    params.set("MessagingServiceSid", msSid);
  } else if (fromNumber) {
    params.set("From", fromNumber);
  }

  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Twilio ${res.status}: ${text.slice(0, 300)}`);
  }
  const json = (await res.json()) as TwilioMessageResponse;
  if (json.error_code) {
    throw new Error(
      `Twilio rejected the send: ${json.error_message || json.error_code}`
    );
  }
  return { sid: json.sid };
}
