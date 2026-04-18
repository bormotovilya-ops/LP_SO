import type { VercelRequest, VercelResponse } from "@vercel/node";

const TG_API = "https://api.telegram.org";
const MAX_FIELD = 4000;

/** Vercel/Node иногда отдаёт JSON строкой или Buffer; редко — только stream. */
async function readJsonBody(req: VercelRequest): Promise<Record<string, unknown>> {
  const raw = req.body as unknown;
  if (raw != null && typeof raw === "string") {
    try {
      const o = JSON.parse(raw) as unknown;
      return o && typeof o === "object" && !Array.isArray(o) ? (o as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  if (Buffer.isBuffer(raw)) {
    try {
      const o = JSON.parse(raw.toString("utf8")) as unknown;
      return o && typeof o === "object" && !Array.isArray(o) ? (o as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  const chunks: Buffer[] = [];
  try {
    for await (const chunk of req) {
      if (Buffer.isBuffer(chunk)) chunks.push(chunk);
      else if (typeof chunk === "string") chunks.push(Buffer.from(chunk, "utf8"));
    }
  } catch {
    return {};
  }
  if (chunks.length === 0) return {};
  try {
    const o = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
    return o && typeof o === "object" && !Array.isArray(o) ? (o as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

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

  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHANNEL_ID?.trim();

  if (!token || !chatId) {
    console.error("Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHANNEL_ID");
    return res.status(500).json({ error: "Server misconfigured" });
  }

  const body = await readJsonBody(req);

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
    console.error("[contact] invalid payload", {
      keys: Object.keys(body),
      nameLen: name.length,
      contactLen: contact.length,
    });
    return res.status(400).json({ error: "Invalid payload" });
  }

  console.log("[contact] sending to telegram", { nameLen: name.length, contactLen: contact.length });

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

    const tgRaw = await tgRes.text();
    let tgJson: { ok?: boolean; description?: string };
    try {
      tgJson = JSON.parse(tgRaw) as { ok?: boolean; description?: string };
    } catch {
      console.error("Telegram non-JSON response", tgRes.status, tgRaw.slice(0, 500));
      return res.status(502).json({ error: "Delivery failed" });
    }

    // Telegram почти всегда отдаёт HTTP 200 даже при ошибке (ok: false).
    if (!tgJson.ok) {
      console.error("Telegram sendMessage rejected:", tgJson.description ?? tgRaw.slice(0, 300));
      return res.status(502).json({ error: "Delivery failed" });
    }
  }

  console.log("[contact] telegram ok");
  return res.status(200).json({ ok: true });
}
