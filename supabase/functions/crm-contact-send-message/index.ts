import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

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

function toSafeText(raw: unknown, max = 3500): string {
  return String(raw ?? "").trim().slice(0, max);
}

function parseTelegramId(raw: unknown): number | null {
  const v = String(raw ?? "").trim();
  if (!/^\d+$/.test(v)) return null;
  const n = Number(v);
  if (!Number.isSafeInteger(n)) return null;
  return n;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")?.trim();
  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN")?.trim();
  if (!supabaseUrl || !serviceRole || !anonKey || !botToken) {
    return json({ error: "Server misconfigured" }, 500);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) {
    return json({ error: "Unauthorized" }, 401);
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: authHeader } },
  });
  const { data: authData, error: authError } = await authClient.auth.getUser();
  const userId = authData?.user?.id ?? null;
  if (authError || !userId) {
    return json({ error: "Unauthorized" }, 401);
  }

  const adminClient = createClient(supabaseUrl, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: profile, error: profileError } = await adminClient
    .from("crm_profiles")
    .select("role, is_active")
    .eq("id", userId)
    .maybeSingle();
  if (profileError) return json({ error: "Failed to verify profile" }, 500);
  if (!profile || profile.is_active !== true || !["admin", "manager"].includes(String(profile.role ?? ""))) {
    return json({ error: "Forbidden" }, 403);
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const contactId = String(body.contactId ?? "").trim();
  const telegramId = parseTelegramId(body.telegramId);
  const text = toSafeText(body.text);
  if (!contactId || !telegramId || !text) {
    return json({ error: "Invalid payload" }, 400);
  }

  const tgRes = await fetch(`${TG_API}/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: telegramId,
      text,
      disable_web_page_preview: true,
    }),
  });
  const tgRaw = await tgRes.text();
  let tgJson: { ok?: boolean; description?: string };
  try {
    tgJson = JSON.parse(tgRaw) as { ok?: boolean; description?: string };
  } catch {
    return json({ error: "Telegram response parse failed" }, 502);
  }
  if (!tgJson.ok) {
    return json({ error: "Telegram rejected message", details: tgJson.description ?? "unknown" }, 502);
  }

  await adminClient.rpc("crm_add_interaction", {
    p_contact_id: contactId,
    p_channel: "telegram_bot",
    p_direction: "outbound",
    p_interaction_type: "outbound_manual_telegram_message",
    p_payload: {
      text,
      via: "telegram_id_sendMessage",
      manager_user_id: userId,
      telegram_id: telegramId,
    },
  });

  return json({ ok: true });
});
