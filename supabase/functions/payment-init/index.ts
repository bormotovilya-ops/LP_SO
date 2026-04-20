import "@supabase/functions-js/edge-runtime.d.ts"

const INIT_PROD = "https://securepay.tinkoff.ru/v2/Init";
const INIT_TEST = "https://rest-api-test.tinkoff.ru/v2/Init";
// Temporary test price: 5 RUB.
const AMOUNT_KOPECKS = 500;
const RECEIPT_ITEM_NAME = "Сборники практик (цифровой продукт)";
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
type JsonRecord = Record<string, unknown>;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function isNonEmptyEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
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

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function makeToken(payload: JsonRecord, password: string): Promise<string> {
  const pairs: { key: string; value: string }[] = [];
  for (const [key, val] of Object.entries(payload)) {
    if (key === "Token") continue;
    if (val === undefined || val === null) continue;
    if (typeof val === "object") continue;
    pairs.push({ key, value: String(val) });
  }
  pairs.push({ key: "Password", value: password });
  pairs.sort((a, b) => a.key.localeCompare(b.key));
  return sha256Hex(pairs.map((p) => p.value).join(""));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const terminalKey = Deno.env.get("TBANK_TERMINAL_KEY")?.trim() || Deno.env.get("TINKOFF_TERMINAL_KEY")?.trim();
  const password = Deno.env.get("TBANK_PASSWORD")?.trim() || Deno.env.get("TINKOFF_PASSWORD")?.trim();
  if (!terminalKey || !password) {
    return json({ error: "Server misconfigured" }, 500);
  }

  const useTest = Deno.env.get("TBANK_TEST") === "1" || Deno.env.get("TBANK_TEST") === "true";
  const initUrl = Deno.env.get("TBANK_INIT_URL")?.trim() || (useTest ? INIT_TEST : INIT_PROD);

  let body: JsonRecord = {};
  try {
    body = (await req.json()) as JsonRecord;
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const envOrigin = Deno.env.get("PUBLIC_SITE_URL")?.trim() ? normalizeSiteOrigin(Deno.env.get("PUBLIC_SITE_URL") as string) : "";
  const clientOrigin = typeof body.siteOrigin === "string" ? normalizeSiteOrigin(body.siteOrigin) : "";
  const clientOk =
    clientOrigin.startsWith("https://") ||
    /^http:\/\/localhost(?::\d+)?$/i.test(clientOrigin) ||
    /^http:\/\/127\.0\.0\.1(?::\d+)?$/i.test(clientOrigin);
  const siteOrigin = envOrigin || (clientOk ? clientOrigin : "");
  const returnPath = normalizeReturnPath(body.returnPath);

  const receiptEmailRaw =
    typeof body.receiptEmail === "string"
      ? body.receiptEmail.trim()
      : typeof body.email === "string"
        ? body.email.trim()
        : "";
  const receiptEmail = receiptEmailRaw && isNonEmptyEmail(receiptEmailRaw)
    ? receiptEmailRaw
    : (Deno.env.get("TBANK_RECEIPT_EMAIL")?.trim() ?? "");

  if (!receiptEmail || !isNonEmptyEmail(receiptEmail)) {
    return json(
      {
        error: "Для чека нужен email: задайте TBANK_RECEIPT_EMAIL в Supabase Secrets или передайте receiptEmail в запросе.",
        code: "MISSING_RECEIPT_EMAIL",
      },
      400,
    );
  }

  const taxation = Deno.env.get("TBANK_RECEIPT_TAXATION")?.trim() || Deno.env.get("TINKOFF_RECEIPT_TAXATION")?.trim() || "usn_income";
  const itemTax = Deno.env.get("TBANK_RECEIPT_ITEM_TAX")?.trim() || Deno.env.get("TINKOFF_RECEIPT_ITEM_TAX")?.trim() || "none";

  const orderId = crypto.randomUUID();
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
    const join = (basePath: string, status: "ok" | "fail"): string => {
      const separator = basePath.includes("?") ? "&" : "?";
      return `${siteOrigin}${basePath}${separator}pay=${status}&oid=${encodeURIComponent(orderId)}`;
    };
    payload.SuccessURL = join(returnPath, "ok");
    payload.FailURL = join(returnPath, "fail");
  }

  const functionsBase = (Deno.env.get("FUNCTIONS_BASE_URL")?.trim() || "").replace(/\/+$/, "");
  if (functionsBase) {
    payload.NotificationURL = `${functionsBase}/tbank-notification`;
  }

  const token = await makeToken(payload, password);
  const requestBody = { ...payload, Token: token };

  let initRes: Response;
  try {
    initRes = await fetch(initUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });
  } catch {
    return json({ error: "Payment gateway unreachable" }, 502);
  }

  let gateway: {
    Success?: boolean;
    PaymentURL?: string;
    OrderId?: string;
    ErrorCode?: string;
    Message?: string;
    Details?: string;
  };
  try {
    gateway = (await initRes.json()) as typeof gateway;
  } catch {
    return json({ error: "Invalid gateway response" }, 502);
  }

  if (!gateway.Success || !gateway.PaymentURL) {
    return json(
      { error: gateway.Message || "Payment init failed", code: gateway.ErrorCode, details: gateway.Details },
      400,
    );
  }

  return json({ paymentUrl: gateway.PaymentURL, orderId }, 200);
});
