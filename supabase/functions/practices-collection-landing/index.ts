import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { sendPracticesTochkaReturnChannelNotify } from "../_shared/practicesPaidTelegram.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  let orderIdFromBody = "";
  try {
    const body = (await req.json()) as { orderId?: unknown };
    const raw = typeof body?.orderId === "string" ? body.orderId.trim() : "";
    orderIdFromBody = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw)
      ? raw
      : "";
  } catch {
    // без тела — как раньше
  }

  await sendPracticesTochkaReturnChannelNotify(orderIdFromBody || undefined);

  return json({ ok: true }, 200);
});
