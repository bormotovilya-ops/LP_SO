import "@supabase/functions-js/edge-runtime.d.ts"

const TG_API = "https://api.telegram.org";
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const sentOrderIds = new Map<string, number>();

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function claimOrderNotify(orderId: string): boolean {
  const now = Date.now();
  for (const [id, t] of sentOrderIds) {
    if (now - t > 86_400_000) sentOrderIds.delete(id);
  }
  if (sentOrderIds.has(orderId)) return false;
  sentOrderIds.set(orderId, now);
  return true;
}

function escapeHtml(s: string): string {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const token = Deno.env.get("TELEGRAM_BOT_TOKEN")?.trim();
  const chatId = Deno.env.get("TELEGRAM_CHANNEL_ID")?.trim();
  if (!token || !chatId) {
    return json({ error: "Server misconfigured" }, 500);
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
  if (!claimOrderNotify(orderId)) {
    return json({ ok: true, duplicate: true });
  }

  const html = [
    "<b>Оплата «Сборники практик»</b>",
    "",
    `<b>OrderId:</b> <code>${escapeHtml(orderId)}</code>`,
    "<b>Сумма на витрине:</b> 5 ₽",
    `<b>Время (UTC):</b> <code>${escapeHtml(new Date().toISOString())}</code>`,
  ].join("\n");

  let tgRes: Response;
  try {
    tgRes = await fetch(`${TG_API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: html,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
  } catch {
    sentOrderIds.delete(orderId);
    return json({ error: "Telegram unreachable" }, 502);
  }

  let tgJson: { ok?: boolean };
  try {
    tgJson = (await tgRes.json()) as { ok?: boolean };
  } catch {
    sentOrderIds.delete(orderId);
    return json({ error: "Telegram delivery failed" }, 502);
  }

  if (!tgJson.ok) {
    sentOrderIds.delete(orderId);
    return json({ error: "Telegram rejected message" }, 502);
  }

  return json({ ok: true });
});
