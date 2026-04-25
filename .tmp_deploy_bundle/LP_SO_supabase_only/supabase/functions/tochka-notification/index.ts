import "@supabase/functions-js/edge-runtime.d.ts";

type JsonRecord = Record<string, unknown>;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function resolveBearer(req: Request): string {
  const auth = req.headers.get("authorization")?.trim() || "";
  if (!auth.toLowerCase().startsWith("bearer ")) return "";
  return auth.slice(7).trim();
}

async function readBody(req: Request): Promise<{ parsed: JsonRecord; raw: string }> {
  const raw = (await req.text()).trim();
  if (!raw) return { parsed: {}, raw: "" };
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return { parsed: parsed as JsonRecord, raw };
    }
  } catch {
    // Keep raw for diagnostics.
  }
  return { parsed: {}, raw };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
  }

  const expectedSecret = Deno.env.get("TOCHKA_WEBHOOK_SECRET")?.trim() || "";
  const expectedBearer = Deno.env.get("TOCHKA_WEBHOOK_BEARER")?.trim() || "";
  const incomingSecret =
    req.headers.get("x-webhook-secret")?.trim() ||
    req.headers.get("x-tochka-signature")?.trim() ||
    "";
  const incomingBearer = resolveBearer(req);

  if (expectedSecret && incomingSecret !== expectedSecret) {
    return new Response("FORBIDDEN", { status: 403 });
  }
  if (expectedBearer && incomingBearer !== expectedBearer) {
    return new Response("FORBIDDEN", { status: 403 });
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

  return new Response("OK", {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
});
