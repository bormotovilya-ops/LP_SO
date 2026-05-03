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

function appendAttributionToken(basePayload: string, contextToken?: string): string {
  const trimmed = contextToken?.trim().toLowerCase();
  if (!trimmed || !/^[a-f0-9]{12}$/.test(trimmed)) return basePayload;
  return `${basePayload}_ctx_${trimmed}`;
}

/** Для квиза: UTM передаются в CRM через токен `_ctx_…` (см. Edge `crm-bot-attribution-token` и telegram-webhook). */
export function buildTelegramBotUrl(
  intent: BotIntent,
  options?: { giftTrack?: GiftTrack; contextToken?: string },
): string {
  const base = buildStartPayload(intent, options?.giftTrack);
  const startPayload = appendAttributionToken(base, options?.contextToken);

  const params = new URLSearchParams({ start: startPayload });
  if (!startPayload.includes("_ctx_")) {
    params.set("utm_source", "site");
    params.set("utm_campaign", intent);
  }

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
