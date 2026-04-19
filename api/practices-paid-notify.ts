import type { VercelRequest, VercelResponse } from "@vercel/node";

const TG_API = "https://api.telegram.org";

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

/**
 * То же подтверждение, что и на сайте при `?pay=ok`: редирект после оплаты в Т‑Банке.
 * Те же TELEGRAM_BOT_TOKEN / TELEGRAM_CHANNEL_ID, что и у заявок.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHANNEL_ID?.trim();

  if (!token || !chatId) {
    console.error("[practices-paid-notify] Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHANNEL_ID");
    return res.status(500).json({ error: "Server misconfigured" });
  }

  const body = await readJsonBody(req);
  const orderId = String(body.orderId ?? "")
    .trim()
    .slice(0, 80);

  const lines = [
    "<b>Оплата «Сборники практик»</b>",
    "",
    "Покупатель вернулся на сайт после оплаты в Т‑Банке (как при показе доступа к материалам).",
    orderId
      ? `<b>OrderId:</b> <code>${escapeHtml(orderId)}</code>`
      : "<i>OrderId не передан (другой браузер или сессия сброшена).</i>",
    "<b>Сумма на витрине:</b> 10 ₽",
    `<b>Время (UTC):</b> <code>${escapeHtml(new Date().toISOString())}</code>`,
  ];

  const html = lines.join("\n");

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

  const tgRaw = await tgRes.text();
  let tgJson: { ok?: boolean; description?: string };
  try {
    tgJson = JSON.parse(tgRaw) as { ok?: boolean; description?: string };
  } catch {
    console.error("[practices-paid-notify] telegram non-JSON", tgRes.status, tgRaw.slice(0, 400));
    return res.status(502).json({ error: "Telegram delivery failed" });
  }

  if (!tgJson.ok) {
    console.error("[practices-paid-notify] sendMessage:", tgJson.description ?? tgRaw.slice(0, 300));
    return res.status(502).json({ error: "Telegram rejected message" });
  }

  console.log("[practices-paid-notify] telegram ok", { orderId: orderId || "—" });
  return res.status(200).json({ ok: true });
}
