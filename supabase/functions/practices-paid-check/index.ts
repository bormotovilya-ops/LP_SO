import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createServiceSupabase } from "@lp_so/shared/createServiceSupabase.ts";
import { practicesIsPaid } from "@lp_so/shared/practicesOrdersRepo.ts";

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

  let body: { orderId?: unknown } = {};
  try {
    body = (await req.json()) as { orderId?: unknown };
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const orderId = typeof body.orderId === "string" ? body.orderId.trim() : "";
  if (!orderId || orderId.length > 120 || !looksLikeUuidV4(orderId)) {
    return json({ error: "Invalid orderId" }, 400);
  }

  try {
    const sb = createServiceSupabase();
    const paid = await practicesIsPaid(sb, orderId);
    return json({ paid }, 200);
  } catch (e) {
    console.error("[practices-paid-check]", e);
    return json({ error: "Server error" }, 500);
  }
});

function looksLikeUuidV4(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s.trim());
}
