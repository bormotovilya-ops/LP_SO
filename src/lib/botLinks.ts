export type BotIntent = "diagnostic" | "present" | "razbor";
export type GiftTrack = "fear" | "money" | "relations";

const DEFAULT_BOT_USERNAME = "OSvetlanabot";

function getBotUsername(): string {
  const fromEnv = import.meta.env.VITE_TELEGRAM_BOT_USERNAME?.trim();
  return fromEnv || DEFAULT_BOT_USERNAME;
}

function buildStartPayload(intent: BotIntent, giftTrack?: GiftTrack): string {
  // Telegram `start` payload format is limited, so keep it compact and parseable.
  if (intent === "present" && giftTrack) {
    return `src_site_goal_${intent}_${giftTrack}`;
  }
  return `src_site_goal_${intent}`;
}

export function buildTelegramBotUrl(intent: BotIntent, options?: { giftTrack?: GiftTrack }): string {
  const params = new URLSearchParams({
    start: buildStartPayload(intent, options?.giftTrack),
    utm_source: "site",
    utm_campaign: intent,
  });

  return `https://t.me/${getBotUsername()}?${params.toString()}`;
}

/**
 * Старт для выдачи сборника после прямой оплаты Точки (`?pay=ok` на сайте).
 * Должен совпадать с парсером в `supabase/functions/telegram-webhook/index.ts`.
 */
export const PRACTICES_COLLECTION_BOT_START_PAYLOAD = "src_site_practices_debt_free";

/** Получить материалы в боте: копия поста из канала как у поларок. Без orderId — сценарий «прямая Точка»; с UUID — связка с payment-init. */
export function buildPracticesCollectionTelegramBotUrl(orderId?: string): string {
  const payload = orderId?.trim()
    ? `src_site_practices_${orderId.trim()}`
    : PRACTICES_COLLECTION_BOT_START_PAYLOAD;
  if (payload.length > 64) {
    return `https://t.me/${getBotUsername()}?start=${encodeURIComponent(PRACTICES_COLLECTION_BOT_START_PAYLOAD)}`;
  }
  const params = new URLSearchParams({
    start: payload,
    utm_source: "site",
    utm_campaign: "practices_collection",
  });
  return `https://t.me/${getBotUsername()}?${params.toString()}`;
}
