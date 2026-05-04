/**
 * Ссылки на чат с лидом по numeric Telegram user id.
 * `tg://user?id=` в обычных клиентах часто игнорируется (см. core.telegram.org/api/links — ID links for bot API).
 * Для CRM удобнее веб-клиент и tg://openmessage (Android / часть десктопов).
 */

export function telegramWebKChatUrl(telegramUserId: number): string {
  return `https://web.telegram.org/k/#${telegramUserId}`;
}

/** Открыть диалог в установленном клиенте (часто работает там, где `tg://user?id=` нет). */
export function telegramAppOpenMessageUrl(telegramUserId: number): string {
  return `tg://openmessage?user_id=${telegramUserId}`;
}
