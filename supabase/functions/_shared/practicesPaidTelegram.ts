const TG_API = "https://api.telegram.org";

function escapeHtml(s: string): string {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export async function sendPracticesPurchaseTelegram(orderId: string): Promise<void> {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN")?.trim();
  const chatId = Deno.env.get("TELEGRAM_CHANNEL_ID")?.trim();
  if (!token || !chatId) return;

  const html = [
    "<b>Оплата «Сборники практик»</b>",
    "",
    `<b>OrderId:</b> <code>${escapeHtml(orderId)}</code>`,
    `<b>Время (UTC):</b> <code>${escapeHtml(new Date().toISOString())}</code>`,
  ].join("\n");

  const tgRes = await fetch(`${TG_API}/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: html,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });

  let tgJson: { ok?: boolean; description?: string } = {};
  try {
    tgJson = (await tgRes.json()) as typeof tgJson;
  } catch {
    console.error("[practices telegram] invalid JSON from telegram");
    return;
  }
  if (!tgJson.ok) {
    console.error("[practices telegram] rejected", tgJson.description);
  }
}
