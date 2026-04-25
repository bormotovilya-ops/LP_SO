import type { VercelRequest, VercelResponse } from "@vercel/node";

type JsonRecord = Record<string, unknown>;

async function readBody(req: VercelRequest): Promise<{ parsed: JsonRecord; raw: string }> {
  const raw = req.body as unknown;
  if (raw != null && typeof raw === "string") {
    const text = raw.trim();
    if (!text) return { parsed: {}, raw: "" };
    try {
      const parsed = JSON.parse(text) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return { parsed: parsed as JsonRecord, raw: text };
      }
    } catch {
      // Keep raw for diagnostics.
    }
    return { parsed: {}, raw: text };
  }
  if (Buffer.isBuffer(raw)) {
    const text = raw.toString("utf8").trim();
    if (!text) return { parsed: {}, raw: "" };
    try {
      const parsed = JSON.parse(text) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return { parsed: parsed as JsonRecord, raw: text };
      }
    } catch {
      // Keep raw for diagnostics.
    }
    return { parsed: {}, raw: text };
  }
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return { parsed: raw as JsonRecord, raw: JSON.stringify(raw) };
  }
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    if (Buffer.isBuffer(chunk)) chunks.push(chunk);
    else if (typeof chunk === "string") chunks.push(Buffer.from(chunk, "utf8"));
  }
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) return { parsed: {}, raw: "" };
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return { parsed: parsed as JsonRecord, raw: text };
    }
  } catch {
    // Keep raw for diagnostics.
  }
  return { parsed: {}, raw: text };
}

function resolveBearer(req: VercelRequest): string {
  const auth = req.headers.authorization?.trim() || "";
  if (!auth.toLowerCase().startsWith("bearer ")) return "";
  return auth.slice(7).trim();
}

function hasHeader(req: VercelRequest, name: string): string {
  const raw = req.headers[name] ?? req.headers[name.toLowerCase()];
  if (Array.isArray(raw)) return raw[0]?.trim() ?? "";
  return typeof raw === "string" ? raw.trim() : "";
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).setHeader("Allow", "POST").send("Method Not Allowed");
  }

  const expectedSecret = process.env.TOCHKA_WEBHOOK_SECRET?.trim() || "";
  const expectedBearer = process.env.TOCHKA_WEBHOOK_BEARER?.trim() || "";
  const incomingSecret = hasHeader(req, "x-webhook-secret") || hasHeader(req, "x-tochka-signature");
  const incomingBearer = resolveBearer(req);

  if (expectedSecret && incomingSecret !== expectedSecret) {
    return res.status(403).send("FORBIDDEN");
  }
  if (expectedBearer && incomingBearer !== expectedBearer) {
    return res.status(403).send("FORBIDDEN");
  }

  const { parsed, raw } = await readBody(req);
  const eventType =
    (typeof parsed.event === "string" && parsed.event) ||
    (typeof parsed.type === "string" && parsed.type) ||
    (typeof parsed.status === "string" && parsed.status) ||
    "unknown";
  const orderId =
    (typeof parsed.orderId === "string" && parsed.orderId) ||
    (typeof parsed.order_id === "string" && parsed.order_id) ||
    (typeof parsed.OrderId === "string" && parsed.OrderId) ||
    "";
  const paymentId =
    (typeof parsed.paymentId === "string" && parsed.paymentId) ||
    (typeof parsed.payment_id === "string" && parsed.payment_id) ||
    (typeof parsed.PaymentId === "string" && parsed.PaymentId) ||
    "";

  console.log("[tochka-notification] ok", {
    eventType,
    orderId,
    paymentId,
    rawPreview: raw.slice(0, 500),
  });

  res.status(200).setHeader("Content-Type", "text/plain; charset=utf-8");
  return res.send("OK");
}
