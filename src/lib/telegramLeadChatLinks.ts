/**
 * Ссылки на чат с лидом по numeric Telegram user id.
 * `tg://user?id=` в обычных клиентах часто игнорируется (см. core.telegram.org/api/links — ID links for bot API).
 * Для CRM удобнее веб-клиент и tg://openmessage (Android / часть десктопов).
 */

/** Публичный username Telegram: 5–32 символа, с буквы (правила как у Bot API). */
const TELEGRAM_USERNAME_RE = /^[a-z][a-z0-9_]{4,31}$/;

/** Нормализация: без @, lower case; невалидное → null. */
export function normalizeTelegramUsername(raw: string | null | undefined): string | null {
  if (raw == null || typeof raw !== "string") return null;
  const h = raw.trim().replace(/^@+/, "").toLowerCase();
  return TELEGRAM_USERNAME_RE.test(h) ? h : null;
}

export function telegramMeProfileUrlFromUsername(username: string | null | undefined): string | null {
  const u = normalizeTelegramUsername(username);
  return u ? `https://t.me/${u}` : null;
}

export function telegramWebKChatUrl(telegramUserId: number): string {
  return `https://web.telegram.org/k/#${telegramUserId}`;
}

/** Открыть диалог в установленном клиенте (часто работает там, где `tg://user?id=` нет). */
export function telegramAppOpenMessageUrl(telegramUserId: number): string {
  return `tg://openmessage?user_id=${telegramUserId}`;
}
