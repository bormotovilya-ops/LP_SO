import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  formatPracticesPriceLabel,
  getPracticesAmountKopecks,
} from "@lp_so/shared/practicesPricing.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

/** Публичная цена сборника для витрины (читает тот же Secret, что и payment-init). */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "GET" && req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const amountKopecks = getPracticesAmountKopecks();
  return json({
    ok: true,
    amountKopecks,
    priceLabel: formatPracticesPriceLabel(amountKopecks),
  });
});
