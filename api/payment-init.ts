import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHash, randomUUID } from "crypto";

const INIT_PROD = "https://securepay.tinkoff.ru/v2/Init";
const INIT_TEST = "https://rest-api-test.tinkoff.ru/v2/Init";

/** 10 ₽ — сумма в копейках для эквайринга Т‑Банка */
const AMOUNT_KOPECKS = 1000;

type JsonRecord = Record<string, unknown>;

async function readJsonBody(req: VercelRequest): Promise<JsonRecord> {
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
 * Подпись запроса по правилам Т‑Банка:
 * https://developer.tbank.ru/eacq/intro/developer/token
 */
function makeToken(payload: JsonRecord, password: string): string {
  const pairs: { key: string; value: string }[] = [];
  for (const [key, val] of Object.entries(payload)) {
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

function normalizeSiteOrigin(raw: string): string {
  return raw.trim().replace(/\/+$/, "");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const terminalKey = process.env.TBANK_TERMINAL_KEY?.trim() || process.env.TINKOFF_TERMINAL_KEY?.trim();
  const password = process.env.TBANK_PASSWORD?.trim() || process.env.TINKOFF_PASSWORD?.trim();

  if (!terminalKey || !password) {
    console.error("Missing TBANK_TERMINAL_KEY/TBANK_PASSWORD (or TINKOFF_* aliases)");
    return res.status(500).json({ error: "Server misconfigured" });
  }

  const useTest = process.env.TBANK_TEST === "1" || process.env.TBANK_TEST === "true";
  const initUrl = process.env.TBANK_INIT_URL?.trim() || (useTest ? INIT_TEST : INIT_PROD);

  const body = await readJsonBody(req);

  const envOrigin = process.env.PUBLIC_SITE_URL?.trim() ? normalizeSiteOrigin(process.env.PUBLIC_SITE_URL) : "";
  const clientOrigin =
    typeof body.siteOrigin === "string" ? normalizeSiteOrigin(body.siteOrigin) : "";
  const clientOk =
    clientOrigin.startsWith("https://") ||
    /^http:\/\/localhost(?::\d+)?$/i.test(clientOrigin) ||
    /^http:\/\/127\.0\.0\.1(?::\d+)?$/i.test(clientOrigin);

  const siteOrigin = envOrigin || (clientOk ? clientOrigin : "");

  const orderId = randomUUID();

  const payload: JsonRecord = {
    TerminalKey: terminalKey,
    Amount: AMOUNT_KOPECKS,
    OrderId: orderId,
    Description: "Сборники практик",
  };

  if (siteOrigin) {
    payload.SuccessURL = `${siteOrigin}/?pay=ok`;
    payload.FailURL = `${siteOrigin}/?pay=fail`;
  }

  const token = makeToken(payload, password);
  const requestBody = { ...payload, Token: token };

  let initRes: Response;
  try {
    initRes = await fetch(initUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });
  } catch (e) {
    console.error("[payment-init] fetch failed", e);
    return res.status(502).json({ error: "Payment gateway unreachable" });
  }

  const rawText = await initRes.text();
  let json: {
    Success?: boolean;
    PaymentURL?: string;
    ErrorCode?: string;
    Message?: string;
  };
  try {
    json = JSON.parse(rawText) as typeof json;
  } catch {
    console.error("[payment-init] non-JSON", initRes.status, rawText.slice(0, 400));
    return res.status(502).json({ error: "Invalid gateway response" });
  }

  if (!json.Success || !json.PaymentURL) {
    console.error("[payment-init] init rejected", json.ErrorCode, json.Message, json);
    return res.status(400).json({
      error: json.Message || "Payment init failed",
      code: json.ErrorCode,
    });
  }

  return res.status(200).json({ paymentUrl: json.PaymentURL, orderId });
}
