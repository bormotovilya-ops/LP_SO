import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Body = {
  action?: string;
  token?: string;
  phone?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function toNullableString(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  return value ? value : null;
}

function truncateField(raw: string | null, max: number): string | null {
  if (!raw) return null;
  return raw.length <= max ? raw : raw.slice(0, max);
}

function randomHexToken(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "Server misconfigured: missing Supabase credentials" }, 500);
  }

  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    return json({ error: "Invalid JSON payload" }, 400);
  }

  if (toNullableString(body.action) === "attach_phone") {
    const token = toNullableString(body.token);
    const phone = truncateField(toNullableString(body.phone), 40);
    if (!token || !/^[a-f0-9]{12}$/i.test(token) || !phone) {
      return json({ error: "token (12 hex) and phone are required" }, 400);
    }
    const client = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const t = token.toLowerCase();
    const { data, error } = await client
      .from("crm_bot_start_attribution")
      .update({ phone })
      .eq("token", t)
      .select("token");
    if (error) {
      return json({ error: "Failed to attach phone", details: error.message }, 500);
    }
    if (!data?.length) {
      return json({ error: "Token not found" }, 404);
    }
    return json({ ok: true }, 200);
  }

  const row = {
    utm_source: truncateField(toNullableString(body.utmSource), 512),
    utm_medium: truncateField(toNullableString(body.utmMedium), 512),
    utm_campaign: truncateField(toNullableString(body.utmCampaign), 512),
    utm_content: truncateField(toNullableString(body.utmContent), 512),
    utm_term: truncateField(toNullableString(body.utmTerm), 512),
  };

  if (!row.utm_source && !row.utm_medium && !row.utm_campaign && !row.utm_content && !row.utm_term) {
    return json({ error: "At least one UTM field is required" }, 400);
  }

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  for (let attempt = 0; attempt < 8; attempt++) {
    const token = randomHexToken();
    const { error } = await client.from("crm_bot_start_attribution").insert({
      token,
      ...row,
    });
    if (!error) {
      return json({ ok: true, token }, 200);
    }
    if ((error as { code?: string }).code === "23505") continue;
    return json({ error: "Failed to store attribution", details: error.message }, 500);
  }

  return json({ error: "Failed to allocate token" }, 500);
});
