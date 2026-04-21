/**
 * Optional admin notifications via Telegram.
 * Create a bot via @BotFather, grab the token, then DM the bot and hit
 * https://api.telegram.org/bot<TOKEN>/getUpdates to find your chat_id.
 *
 * Envs: TELEGRAM_BOT_TOKEN, TELEGRAM_ADMIN_CHAT_ID
 */

export function isTelegramConfigured(): boolean {
  return Boolean(
    process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_ADMIN_CHAT_ID
  );
}

export async function notifyTelegram(text: string): Promise<void> {
  if (!isTelegramConfigured()) return;
  const token = process.env.TELEGRAM_BOT_TOKEN!;
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID!;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
      cache: "no-store",
    });
  } catch {
    // Best effort — never block checkout on notification failure.
  }
}
