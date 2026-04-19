import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHash } from "crypto";

const TG_API = "https://api.telegram.org";

type JsonRecord = Record<string, unknown>;

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function isTruthySuccess(v: unknown): boolean {
  return v === true || v === "true";
}

/**
 * Одно уведомление в канал при успешном списании (без AUTHORIZED — иначе дубль при одностадийной оплате).
 */
async function notifyTelegramChannelPayment(body: JsonRecord): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHANNEL_ID?.trim();
  if (!token || !chatId) {
    console.warn("[tbank-notification] telegram skipped: set TELEGRAM_BOT_TOKEN and TELEGRAM_CHANNEL_ID");
    return;
  }

  const status = String(body.Status ?? "");
  if (status !== "CONFIRMED") return;
  if (!isTruthySuccess(body.Success)) return;

  const orderId = String(body.OrderId ?? "");
  const paymentId = String(body.PaymentId ?? "");
  const amountRaw = body.Amount;
  const amountKop = typeof amountRaw === "number" ? amountRaw : Number(amountRaw);
  const amountRub =
    Number.isFinite(amountKop) && amountKop > 0 ? (amountKop / 100).toFixed(2).replace(/\.00$/, "") : "—";
  const desc = String(body.Description ?? "").trim().slice(0, 300);

  const lines = [
    "<b>Оплата на сайте (Т‑Банк)</b>",
    "",
    `<b>Статус:</b> ${escapeHtml(status)}`,
    `<b>Заказ:</b> <code>${escapeHtml(orderId)}</code>`,
    `<b>Платёж:</b> <code>${escapeHtml(paymentId)}</code>`,
    `<b>Сумма:</b> ${escapeHtml(amountRub)} ₽`,
  ];
  if (desc) lines.push("", `<b>Описание:</b> ${escapeHtml(desc)}`);

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
    console.error("[tbank-notification] telegram non-JSON", tgRes.status, tgRaw.slice(0, 400));
    return;
  }
  if (!tgJson.ok) {
    console.error("[tbank-notification] telegram sendMessage failed:", tgJson.description ?? tgRaw.slice(0, 300));
  }
}

/**
 * Чтение тела POST (JSON или уже распарсенный объект Vercel).
 */
async function readBody(req: VercelRequest): Promise<JsonRecord> {
  const raw = req.body as unknown;
  if (raw != null && typeof raw === "string") {
    try {
      const o = JSON.parse(raw) as unknown;
      return o && typeof o === "object" && !Array.isArray(o) ? (o as JsonRecord) : {};
    } catch {
      return {};
    }
  }
  if (Buffer.isBuffer(raw)) {
    try {
      const o = JSON.parse(raw.toString("utf8")) as unknown;
      return o && typeof o === "object" && !Array.isArray(o) ? (o as JsonRecord) : {};
    } catch {
      return {};
    }
  }
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as JsonRecord;
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
    return o && typeof o === "object" && !Array.isArray(o) ? (o as JsonRecord) : {};
  } catch {
    return {};
  }
}

/**
 * Подпись уведомления (как у Init): только корневые поля, без Token, Data, Receipt.
 * https://developer.tbank.ru/eacq/intro/developer/notification
 */
function notificationToken(body: JsonRecord, password: string): string {
  const pairs: { key: string; value: string }[] = [];
  for (const [key, val] of Object.entries(body)) {
    if (key === "Token") continue;
    if (val === undefined || val === null) continue;
    if (typeof val === "object") continue;
    pairs.push({ key, value: String(val) });
  }
  pairs.push({ key: "Password", value: password });
  pairs.sort((a, b) => a.key.localeCompare(b.key));
  const concatenated = pairs.map((p) => p.value).join("");
  return createHash("sha256").update(concatenated, "utf8").digest("hex");
}

function sendOk(res: VercelResponse) {
  res.status(200).setHeader("Content-Type", "text/plain; charset=utf-8");
  return res.send("OK");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).setHeader("Allow", "POST").send("Method Not Allowed");
  }

  const password = process.env.TBANK_PASSWORD?.trim() || process.env.TINKOFF_PASSWORD?.trim();
  const terminalKey = process.env.TBANK_TERMINAL_KEY?.trim() || process.env.TINKOFF_TERMINAL_KEY?.trim();

  if (!password || !terminalKey) {
    console.error("[tbank-notification] missing TBANK_PASSWORD / TBANK_TERMINAL_KEY");
    return res.status(500).send("CONFIG");
  }

  const body = await readBody(req);
  const receivedToken = typeof body.Token === "string" ? body.Token : "";

  const expected = notificationToken(body, password);
  if (!receivedToken || receivedToken !== expected) {
    console.error("[tbank-notification] invalid token", {
      orderId: body.OrderId,
      paymentId: body.PaymentId,
    });
    return res.status(403).send("FORBIDDEN");
  }

  const tk = typeof body.TerminalKey === "string" ? body.TerminalKey : "";
  if (tk && tk !== terminalKey) {
    console.error("[tbank-notification] terminal mismatch");
    return res.status(403).send("FORBIDDEN");
  }

  console.log("[tbank-notification] ok", {
    OrderId: body.OrderId,
    PaymentId: body.PaymentId,
    Status: body.Status,
    Success: body.Success,
    Amount: body.Amount,
  });

  try {
    await notifyTelegramChannelPayment(body);
  } catch (e) {
    console.error("[tbank-notification] telegram notify error", e);
  }

  return sendOk(res);
}
