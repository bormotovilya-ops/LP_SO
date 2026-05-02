import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createServiceSupabase } from "../_shared/createServiceSupabase.ts";
import { practicesIsPaid } from "../_shared/practicesOrdersRepo.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULT_BUCKET = "practice_materials";
const DEFAULT_OBJECT = "sborniki-praktik.zip";
const SIGN_TTL_SEC = 300;

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
  if (!orderId || orderId.length > 120) {
    return json({ error: "Missing orderId" }, 400);
  }

  const bucket = Deno.env.get("PRACTICES_STORAGE_BUCKET")?.trim() || DEFAULT_BUCKET;
  const objectPath = Deno.env.get("PRACTICES_STORAGE_OBJECT")?.trim() || DEFAULT_OBJECT;

  try {
    const sb = createServiceSupabase();
    const paid = await practicesIsPaid(sb, orderId);
    if (!paid) {
      return json({ ok: false, pending: true, error: "Payment not confirmed" }, 402);
    }
    const { data, error } = await sb.storage.from(bucket).createSignedUrl(objectPath, SIGN_TTL_SEC);
    if (error || !data?.signedUrl) {
      console.error("[practices-access] signed url failed", error);
      return json({ ok: false, error: "Materials unavailable — upload file to Supabase Storage" }, 503);
    }
    return json({
      ok: true,
      signedUrl: data.signedUrl,
      expiresInSeconds: SIGN_TTL_SEC,
    });
  } catch (e) {
    console.error("[practices-access]", e);
    return json({ ok: false, error: "Server misconfigured or database error" }, 500);
  }
});
