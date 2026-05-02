const TG_API = "https://api.telegram.org";

function escapeHtml(s: string): string {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export async function sendPracticesPurchaseTelegram(orderId: string, receiptEmail?: string | null): Promise<void> {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN")?.trim();
  const chatId = Deno.env.get("TELEGRAM_CHANNEL_ID")?.trim();
  if (!token || !chatId) return;

  const emailLine = receiptEmail?.trim()
    ? `<b>Email (чек):</b> <code>${escapeHtml(receiptEmail.trim())}</code>`
    : "";

  const html = [
    "<b>Оплата сборника</b> «Свобода от долгов и кредитов»",
    "",
    `<b>OrderId:</b> <code>${escapeHtml(orderId)}</code>`,
    emailLine,
    "<b>Сумма:</b> 4 990 ₽",
    `<b>Время (UTC):</b> <code>${escapeHtml(new Date().toISOString())}</code>`,
  ]
    .filter(Boolean)
    .join("\n");

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

/** Сигнал с сайта: пользователь вернулся со страницы оплаты Точки с `?pay=ok`. `orderId` — если банк/редирект передал номер заказа. */
export async function sendPracticesTochkaReturnChannelNotify(orderId?: string | null): Promise<void> {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN")?.trim();
  const chatId = Deno.env.get("TELEGRAM_CHANNEL_ID")?.trim();
  if (!token || !chatId) return;

  const orderLine = orderId?.trim()
    ? `<b>OrderId:</b> <code>${escapeHtml(orderId.trim().slice(0, 80))}</code>`
    : "";

  const html = [
    "<b>Оплата сборника</b> «Свобода от долгов и кредитов»",
    "",
    "<b>Источник:</b> успешный возврат на сайт после оплаты (ссылка Точки)",
    orderLine,
    "<b>Сумма на витрине:</b> 4 990 ₽",
    `<b>Время (UTC):</b> <code>${escapeHtml(new Date().toISOString())}</code>`,
  ]
    .filter(Boolean)
    .join("\n");

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
    console.error("[practices tochka return telegram] invalid JSON");
    return;
  }
  if (!tgJson.ok) {
    console.error("[practices tochka return telegram] rejected", tgJson.description);
  }
}
