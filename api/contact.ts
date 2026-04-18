import type { VercelRequest, VercelResponse } from "@vercel/node";

const TG_API = "https://api.telegram.org";
const MAX_FIELD = 4000;

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function sliceTelegramChunks(html: string, maxLen: number): string[] {
  if (html.length <= maxLen) return [html];
  const chunks: string[] = [];
  let rest = html;
  while (rest.length > 0) {
    chunks.push(rest.slice(0, maxLen));
    rest = rest.slice(maxLen);
  }
  return chunks;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHANNEL_ID;

  if (!token || !chatId) {
    console.error("Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHANNEL_ID");
    return res.status(500).json({ error: "Server misconfigured" });
  }

  const raw = req.body;
  const body =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};

  const honeypot = String(body.website ?? "").trim();
  if (honeypot) {
    return res.status(200).json({ ok: true });
  }

  const name = String(body.name ?? "")
    .trim()
    .slice(0, MAX_FIELD);
  const contact = String(body.contact ?? "")
    .trim()
    .slice(0, MAX_FIELD);
  const messenger = String(body.messenger ?? "")
    .trim()
    .slice(0, MAX_FIELD);
  const goal = String(body.goal ?? "")
    .trim()
    .slice(0, MAX_FIELD);
  const message = String(body.message ?? "")
    .trim()
    .slice(0, MAX_FIELD);

  if (!name || !contact) {
    return res.status(400).json({ error: "Invalid payload" });
  }

  const lines = [
    "<b>Новая заявка с сайта</b>",
    "",
    `<b>Имя:</b> ${escapeHtml(name)}`,
    `<b>Контакт:</b> ${escapeHtml(contact)}`,
    `<b>Удобный канал:</b> ${escapeHtml(messenger || "—")}`,
    `<b>Запрос:</b> ${escapeHtml(goal || "—")}`,
    "",
    `<b>О ситуации:</b>`,
    escapeHtml(message || "—"),
  ];

  const html = lines.join("\n");
  const chunks = sliceTelegramChunks(html, 4000);

  for (let i = 0; i < chunks.length; i++) {
    const part = chunks.length > 1 ? `<i>(${i + 1}/${chunks.length})</i>\n` : "";
    const text = part + chunks[i];
    const tgRes = await fetch(`${TG_API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });

    if (!tgRes.ok) {
      const errBody = await tgRes.text();
      console.error("Telegram sendMessage failed", tgRes.status, errBody);
      return res.status(502).json({ error: "Delivery failed" });
    }
  }

  return res.status(200).json({ ok: true });
}
