export type BotIntent = "diagnostic" | "present" | "razbor";

const DEFAULT_BOT_USERNAME = "OSvetlanabot";

function getBotUsername(): string {
  const fromEnv = import.meta.env.VITE_TELEGRAM_BOT_USERNAME?.trim();
  return fromEnv || DEFAULT_BOT_USERNAME;
}

function buildStartPayload(intent: BotIntent): string {
  // Telegram `start` payload format is limited, so keep it compact and parseable.
  return `src_site_goal_${intent}`;
}

export function buildTelegramBotUrl(intent: BotIntent): string {
  const params = new URLSearchParams({
    start: buildStartPayload(intent),
    utm_source: "site",
    utm_campaign: intent,
  });

  return `https://t.me/${getBotUsername()}?${params.toString()}`;
}
