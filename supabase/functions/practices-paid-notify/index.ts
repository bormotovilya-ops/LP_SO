import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { sendPracticesPurchaseTelegram } from "@lp_so/shared/practicesPaidTelegram.ts";

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

function bearerToken(req: Request): string {
  const h = req.headers.get("authorization")?.trim() || "";
  if (!h.toLowerCase().startsWith("bearer ")) return "";
  return h.slice(7).trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  /** Раньше можно было звать безопаснее из браузера; уведомления теперь шлёт webhook. Это только ручной секретный вызов. */
  const expected = Deno.env.get("PRACTICES_MANUAL_NOTIFY_SECRET")?.trim();
  if (!expected) {
    return json({ error: "Ручное уведомление отключено (задайте PRACTICES_MANUAL_NOTIFY_SECRET)." }, 410);
  }
  if (bearerToken(req) !== expected) {
    return json({ error: "Forbidden" }, 403);
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const orderId = String(body.orderId ?? "").trim().slice(0, 80);
  if (!orderId) {
    return json({ ok: true, skipped: true });
  }

  await sendPracticesPurchaseTelegram(orderId);
  return json({ ok: true });
});
