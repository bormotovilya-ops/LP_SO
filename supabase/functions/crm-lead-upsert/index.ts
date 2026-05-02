import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type LeadPayload = {
  fullName?: string;
  phone?: string;
  email?: string;
  telegramId?: number | string;
  sourceChannel?: string;
  sourceDetail?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  segment?: string;
  ownerUserId?: string;
  consentPersonalData?: boolean;
  comment?: string;
  interaction?: {
    channel?: string;
    direction?: "inbound" | "outbound" | "internal";
    type?: string;
    payload?: Record<string, unknown>;
  };
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

function toNullableBigint(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isInteger(raw)) return raw;
  if (typeof raw === "string" && raw.trim() && /^-?\d+$/.test(raw.trim())) {
    return Number(raw.trim());
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "Server misconfigured: missing Supabase credentials" }, 500);
  }

  let body: LeadPayload = {};
  try {
    body = (await req.json()) as LeadPayload;
  } catch {
    return json({ error: "Invalid JSON payload" }, 400);
  }

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const rpcPayload = {
    p_full_name: toNullableString(body.fullName),
    p_phone: toNullableString(body.phone),
    p_email: toNullableString(body.email),
    p_telegram_id: toNullableBigint(body.telegramId),
    p_source_channel: toNullableString(body.sourceChannel) ?? "other",
    p_source_detail: toNullableString(body.sourceDetail),
    p_utm_source: toNullableString(body.utmSource),
    p_utm_medium: toNullableString(body.utmMedium),
    p_utm_campaign: toNullableString(body.utmCampaign),
    p_utm_content: toNullableString(body.utmContent),
    p_utm_term: toNullableString(body.utmTerm),
    p_segment: toNullableString(body.segment),
    p_owner_user_id: toNullableString(body.ownerUserId),
    p_consent_personal_data: Boolean(body.consentPersonalData),
    p_comment: toNullableString(body.comment),
  };

  const { data: contact, error: upsertError } = await client.rpc("crm_upsert_contact", rpcPayload);
  if (upsertError) {
    return json({ error: "Failed to upsert lead", details: upsertError.message }, 400);
  }

  if (body.interaction && contact?.id) {
    const { error: interactionError } = await client.rpc("crm_add_interaction", {
      p_contact_id: contact.id,
      p_channel: toNullableString(body.interaction.channel) ?? "unknown",
      p_direction: toNullableString(body.interaction.direction) ?? "internal",
      p_interaction_type: toNullableString(body.interaction.type) ?? "lead_capture",
      p_payload: body.interaction.payload ?? {},
    });

    if (interactionError) {
      return json(
        {
          error: "Lead saved but interaction failed",
          contact,
          details: interactionError.message,
        },
        207,
      );
    }
  }

  return json({ ok: true, contact }, 200);
});
