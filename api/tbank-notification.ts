import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHash } from "crypto";

type JsonRecord = Record<string, unknown>;

/** Т‑Банк может прислать ключи в другом регистре (например status вместо Status). */
function getRootCI(body: JsonRecord, name: string): unknown {
  const want = name.toLowerCase();
  for (const [k, val] of Object.entries(body)) {
    if (k.toLowerCase() === want) return val;
  }
  return undefined;
}

/**
 * Чтение тела POST (JSON или уже распарсенный объект Vercel).
 */
function parseUrlEncodedToRecord(s: string): JsonRecord {
  const params = new URLSearchParams(s);
  const out: JsonRecord = {};
  for (const [k, v] of params.entries()) {
    out[k] = v;
  }
  return out;
}

async function readBody(req: VercelRequest): Promise<JsonRecord> {
  const raw = req.body as unknown;
  if (raw != null && typeof raw === "string") {
    const t = raw.trim();
    if (!t) return {};
    try {
      const o = JSON.parse(t) as unknown;
      return o && typeof o === "object" && !Array.isArray(o) ? (o as JsonRecord) : {};
    } catch {
      const fromForm = parseUrlEncodedToRecord(t);
      if (Object.keys(fromForm).length > 0) return fromForm;
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
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) return {};
  try {
    const o = JSON.parse(text) as unknown;
    return o && typeof o === "object" && !Array.isArray(o) ? (o as JsonRecord) : {};
  } catch {
    const fromForm = parseUrlEncodedToRecord(text);
    return Object.keys(fromForm).length > 0 ? fromForm : {};
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
    OrderId: getRootCI(body, "OrderId"),
    PaymentId: getRootCI(body, "PaymentId"),
    Status: getRootCI(body, "Status"),
    Success: getRootCI(body, "Success"),
    Amount: getRootCI(body, "Amount"),
    NotificationType: getRootCI(body, "NotificationType"),
  });

  return sendOk(res);
}
