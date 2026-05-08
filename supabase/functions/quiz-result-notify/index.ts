import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const TG_API = "https://api.telegram.org";

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

function trimField(v: unknown, max: number): string {
  return String(v ?? "").trim().slice(0, max);
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
    console.error("[quiz-result-notify] missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHANNEL_ID");
    return json({ error: "Server misconfigured" }, 500);
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const rawNum = body.quizNumber;
  const n = typeof rawNum === "number" ? rawNum : Number(rawNum);
  if (!Number.isInteger(n) || n < 1 || n > 9) {
    return json({ error: "Invalid quizNumber" }, 400);
  }

  const focusLabel = trimField(body.focusLabel, 512) || "—";
  const situationLabel = trimField(body.situationLabel, 512) || "—";
  const communicationChannel = trimField(body.communicationChannel, 256) || "";
  const accountLink = trimField(body.accountLink, 1024) || "";
  const utmSource = trimField(body.utmSource, 512) || "—";
  const utmMedium = trimField(body.utmMedium, 512) || "—";
  const utmCampaign = trimField(body.utmCampaign, 512) || "—";
  const utmContent = trimField(body.utmContent, 512) || "—";
  const utmTerm = trimField(body.utmTerm, 512) || "—";

  const lines = [
    "<b>Квиз: дошли до результата</b>",
    "",
    "Пользователь нажал «Показать результат» (после ввода канала связи и ссылки на аккаунт).",
    "",
    `<b>Число:</b> ${escapeHtml(String(n))}`,
    `<b>Тема:</b> ${escapeHtml(focusLabel)}`,
    `<b>Запрос:</b> ${escapeHtml(situationLabel)}`,
    ...(communicationChannel
      ? [`<b>Канал связи:</b> ${escapeHtml(communicationChannel)}`]
      : []),
    ...(accountLink ? [`<b>Ссылка на аккаунт:</b> ${escapeHtml(accountLink)}`] : []),
    "",
    "<b>UTM</b>",
    `<b>utm_source:</b> ${escapeHtml(utmSource)}`,
    `<b>utm_medium:</b> ${escapeHtml(utmMedium)}`,
    `<b>utm_campaign:</b> ${escapeHtml(utmCampaign)}`,
    `<b>utm_content:</b> ${escapeHtml(utmContent)}`,
    `<b>utm_term:</b> ${escapeHtml(utmTerm)}`,
    "",
    `<b>Время (UTC):</b> <code>${escapeHtml(new Date().toISOString())}</code>`,
  ];

  const text = lines.join("\n");

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

  const tgRaw = await tgRes.text();
  let tgJson: { ok?: boolean; description?: string };
  try {
    tgJson = JSON.parse(tgRaw) as { ok?: boolean; description?: string };
  } catch {
    console.error("[quiz-result-notify] telegram non-JSON", tgRes.status, tgRaw.slice(0, 400));
    return json({ error: "Delivery failed" }, 502);
  }

  if (!tgJson.ok) {
    console.error("[quiz-result-notify] sendMessage rejected:", tgJson.description ?? tgRaw.slice(0, 300));
    return json({ error: "Delivery failed" }, 502);
  }

  return json({ ok: true });
});
