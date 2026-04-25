import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHash, randomUUID } from "crypto";

const INIT_PROD = "https://securepay.tinkoff.ru/v2/Init";
const INIT_TEST = "https://rest-api-test.tinkoff.ru/v2/Init";

/** 4 990 ₽ — сумма в копейках для эквайринга Т‑Банка */
const AMOUNT_KOPECKS = 499000;

const RECEIPT_ITEM_NAME = "Сборники практик (цифровой продукт)";

type JsonRecord = Record<string, unknown>;
type PaymentProvider = "tochka" | "tbank";

function isNonEmptyEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

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

function normalizeReturnPath(raw: unknown): string {
  if (typeof raw !== "string") return "/";
  const path = raw.trim();
  if (!path.startsWith("/")) return "/";
  if (path.startsWith("//")) return "/";
  return path;
}

function parseProvider(raw: unknown): PaymentProvider | null {
  if (typeof raw !== "string") return null;
  const normalized = raw.trim().toLowerCase();
  if (normalized === "tochka") return "tochka";
  if (normalized === "tbank") return "tbank";
  return null;
}

function resolveProvider(body: JsonRecord): PaymentProvider {
  const bodyProvider = parseProvider(body.provider);
  if (bodyProvider) return bodyProvider;
  const envProvider = parseProvider(process.env.PAYMENT_PROVIDER);
  return envProvider ?? "tochka";
}

function pickFirstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = await readJsonBody(req);
  const provider = resolveProvider(body);

  const envOrigin = process.env.PUBLIC_SITE_URL?.trim() ? normalizeSiteOrigin(process.env.PUBLIC_SITE_URL) : "";
  const clientOrigin =
    typeof body.siteOrigin === "string" ? normalizeSiteOrigin(body.siteOrigin) : "";
  const clientOk =
    clientOrigin.startsWith("https://") ||
    /^http:\/\/localhost(?::\d+)?$/i.test(clientOrigin) ||
    /^http:\/\/127\.0\.0\.1(?::\d+)?$/i.test(clientOrigin);

  const siteOrigin = envOrigin || (clientOk ? clientOrigin : "");
  const returnPath = normalizeReturnPath(body.returnPath);

  const orderId = randomUUID();

  const receiptEmailRaw =
    typeof body.receiptEmail === "string"
      ? body.receiptEmail.trim()
      : typeof body.email === "string"
        ? body.email.trim()
        : "";
  const fallbackReceiptEmail =
    provider === "tochka"
      ? process.env.TOCHKA_RECEIPT_EMAIL?.trim() ?? process.env.TBANK_RECEIPT_EMAIL?.trim() ?? ""
      : process.env.TBANK_RECEIPT_EMAIL?.trim() ?? "";
  const receiptEmail = receiptEmailRaw && isNonEmptyEmail(receiptEmailRaw) ? receiptEmailRaw : fallbackReceiptEmail;

  if (!receiptEmail || !isNonEmptyEmail(receiptEmail)) {
    console.error("[payment-init] missing receipt email (body.receiptEmail or TBANK_RECEIPT_EMAIL)");
    return res.status(400).json({
      error:
        "Для чека нужен email: задайте TBANK_RECEIPT_EMAIL в Vercel или передайте receiptEmail в запросе.",
      code: "MISSING_RECEIPT_EMAIL",
    });
  }

  const joinReturn = (status: "ok" | "fail"): string => {
    if (!siteOrigin) return "";
    const separator = returnPath.includes("?") ? "&" : "?";
    return `${siteOrigin}${returnPath}${separator}pay=${status}`;
  };

  if (provider === "tbank") {
    const terminalKey = process.env.TBANK_TERMINAL_KEY?.trim() || process.env.TINKOFF_TERMINAL_KEY?.trim();
    const password = process.env.TBANK_PASSWORD?.trim() || process.env.TINKOFF_PASSWORD?.trim();
    if (!terminalKey || !password) {
      console.error("Missing TBANK_TERMINAL_KEY/TBANK_PASSWORD (or TINKOFF_* aliases)");
      return res.status(500).json({ error: "Server misconfigured" });
    }

    const useTest = process.env.TBANK_TEST === "1" || process.env.TBANK_TEST === "true";
    const initUrl = process.env.TBANK_INIT_URL?.trim() || (useTest ? INIT_TEST : INIT_PROD);
    const taxation =
      process.env.TBANK_RECEIPT_TAXATION?.trim() ||
      process.env.TINKOFF_RECEIPT_TAXATION?.trim() ||
      "usn_income";
    const itemTax =
      process.env.TBANK_RECEIPT_ITEM_TAX?.trim() ||
      process.env.TINKOFF_RECEIPT_ITEM_TAX?.trim() ||
      "none";

    const payload: JsonRecord = {
      TerminalKey: terminalKey,
      Amount: AMOUNT_KOPECKS,
      OrderId: orderId,
      Description: "Сборники практик",
      Receipt: {
        Email: receiptEmail,
        Taxation: taxation,
        Items: [
          {
            Name: RECEIPT_ITEM_NAME,
            Price: AMOUNT_KOPECKS,
            Quantity: 1,
            Amount: AMOUNT_KOPECKS,
            Tax: itemTax,
            PaymentMethod: "full_payment",
            PaymentObject: "service",
          },
        ],
      },
    };

    if (siteOrigin) {
      payload.SuccessURL = joinReturn("ok");
      payload.FailURL = joinReturn("fail");
      payload.NotificationURL = `${siteOrigin}/api/tbank-notification`;
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
      console.error("[payment-init] tbank fetch failed", e);
      return res.status(502).json({ error: "Payment gateway unreachable" });
    }

    const rawText = await initRes.text();
    let json: {
      Success?: boolean;
      PaymentURL?: string;
      ErrorCode?: string;
      Message?: string;
      Details?: string;
    };
    try {
      json = JSON.parse(rawText) as typeof json;
    } catch {
      console.error("[payment-init] tbank non-JSON", initRes.status, rawText.slice(0, 400));
      return res.status(502).json({ error: "Invalid gateway response" });
    }

    if (!json.Success || !json.PaymentURL) {
      console.error("[payment-init] tbank init rejected", json.ErrorCode, json.Message, json.Details, json);
      return res.status(400).json({
        error: json.Message || "Payment init failed",
        code: json.ErrorCode,
        details: json.Details,
      });
    }

    return res.status(200).json({ paymentUrl: json.PaymentURL, orderId, provider });
  }

  const apiToken = process.env.TOCHKA_API_TOKEN?.trim();
  const merchantId = process.env.TOCHKA_MERCHANT_ID?.trim();
  const initUrl =
    process.env.TOCHKA_INIT_URL?.trim() ||
    (process.env.TOCHKA_API_BASE_URL?.trim()
      ? `${process.env.TOCHKA_API_BASE_URL?.trim()?.replace(/\/+$/, "")}/payments`
      : "");
  if (!apiToken || !merchantId || !initUrl) {
    return res.status(500).json({
      error: "Tochka payment is not configured yet. Set TOCHKA_API_TOKEN, TOCHKA_MERCHANT_ID and TOCHKA_INIT_URL (or TOCHKA_API_BASE_URL).",
      code: "TOCHKA_MISCONFIGURED",
    });
  }

  const tochkaPayload: JsonRecord = {
    merchantId,
    orderId,
    amount: {
      value: (AMOUNT_KOPECKS / 100).toFixed(2),
      currency: "RUB",
    },
    description: "Сборники практик",
    customer: { email: receiptEmail },
  };
  if (siteOrigin) {
    tochkaPayload.successUrl = joinReturn("ok");
    tochkaPayload.failUrl = joinReturn("fail");
    tochkaPayload.callbackUrl =
      process.env.TOCHKA_CALLBACK_URL?.trim() || `${siteOrigin}/api/tochka-notification`;
  }

  let tochkaRes: Response;
  try {
    tochkaRes = await fetch(initUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiToken}`,
      },
      body: JSON.stringify(tochkaPayload),
    });
  } catch (e) {
    console.error("[payment-init] tochka fetch failed", e);
    return res.status(502).json({ error: "Payment gateway unreachable" });
  }

  const rawText = await tochkaRes.text();
  let tochkaJson: JsonRecord = {};
  try {
    tochkaJson = JSON.parse(rawText) as JsonRecord;
  } catch {
    console.error("[payment-init] tochka non-JSON", tochkaRes.status, rawText.slice(0, 400));
    return res.status(502).json({ error: "Invalid gateway response" });
  }

  const paymentUrl = pickFirstString(
    tochkaJson.paymentUrl,
    tochkaJson.paymentURL,
    tochkaJson.redirectUrl,
    tochkaJson.url,
    (tochkaJson.data as JsonRecord | undefined)?.paymentUrl,
    (tochkaJson.data as JsonRecord | undefined)?.redirectUrl,
    (tochkaJson.result as JsonRecord | undefined)?.paymentUrl,
  );
  if (!tochkaRes.ok || !paymentUrl) {
    return res.status(400).json({
      error: pickFirstString(tochkaJson.error, tochkaJson.message, "Payment init failed"),
      details: tochkaJson,
    });
  }

  return res.status(200).json({ paymentUrl, orderId, provider });
}
