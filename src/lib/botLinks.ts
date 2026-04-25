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
