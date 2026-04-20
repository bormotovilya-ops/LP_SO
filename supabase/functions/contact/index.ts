import "@supabase/functions-js/edge-runtime.d.ts"

const TG_API = "https://api.telegram.org";
const MAX_FIELD = 4000;
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

function escapeHtml(s: string): string {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function sliceTelegramChunks(html: string, maxLen: number): string[] {
  if (html.length <= maxLen) return [html];
  const chunks: string[] = [];
  let rest = html;
  while (rest.length > 0) {
    chunks.push(rest.slice(0, maxLen));
    rest = rest.slice(maxLen);
  }
  return chunks;
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
    console.error("[contact] missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHANNEL_ID");
    return json({ error: "Server misconfigured" }, 500);
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const name = String(body.name ?? "").trim().slice(0, MAX_FIELD);
  const contact = String(body.contact ?? "").trim().slice(0, MAX_FIELD);
  const messenger = String(body.messenger ?? "").trim().slice(0, MAX_FIELD);
  const goal = String(body.goal ?? "").trim().slice(0, MAX_FIELD);
  const message = String(body.message ?? "").trim().slice(0, MAX_FIELD);

  if (!name || !contact) {
    return json({ error: "Invalid payload" }, 400);
  }

  const lines = [
    "<b>Новая заявка с сайта</b>",
    "",
    `<b>Имя:</b> ${escapeHtml(name)}`,
    `<b>Контакт:</b> ${escapeHtml(contact)}`,
    `<b>Удобный канал:</b> ${escapeHtml(messenger || "—")}`,
    `<b>Запрос:</b> ${escapeHtml(goal || "—")}`,
    "",
    "<b>О ситуации:</b>",
    escapeHtml(message || "—"),
  ];
  const chunks = sliceTelegramChunks(lines.join("\n"), 4000);

  for (let i = 0; i < chunks.length; i++) {
    const part = chunks.length > 1 ? `<i>(${i + 1}/${chunks.length})</i>\n` : "";
    const text = part + chunks[i];

    const tgRes = await fetch(`${TG_API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });

    let tgJson: { ok?: boolean };
    try {
      tgJson = (await tgRes.json()) as { ok?: boolean };
    } catch {
      return json({ error: "Delivery failed" }, 502);
    }

    if (!tgJson.ok) {
      return json({ error: "Delivery failed" }, 502);
    }
  }

  return json({ ok: true });
});
