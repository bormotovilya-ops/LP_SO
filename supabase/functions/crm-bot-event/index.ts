import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type BotEventPayload = {
  telegramId?: number | string;
  fullName?: string;
  phone?: string;
  email?: string;
  sourceDetail?: string;
  eventType?: string;
  text?: string;
  intent?: string;
  stageCode?: string;
  metadata?: Record<string, unknown>;
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
  if (typeof raw === "string" && raw.trim() && /^-?\d+$/.test(raw.trim())) return Number(raw.trim());
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

  let body: BotEventPayload = {};
  try {
    body = (await req.json()) as BotEventPayload;
  } catch {
    return json({ error: "Invalid JSON payload" }, 400);
  }

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: contact, error: upsertError } = await client.rpc("crm_upsert_contact", {
    p_full_name: toNullableString(body.fullName),
    p_phone: toNullableString(body.phone),
    p_email: toNullableString(body.email),
    p_telegram_id: toNullableBigint(body.telegramId),
    p_source_channel: "telegram_bot",
    p_source_detail: toNullableString(body.sourceDetail) ?? "bot_event",
    p_comment: null,
  });

  if (upsertError || !contact?.id) {
    return json({ error: "Failed to resolve contact", details: upsertError?.message }, 400);
  }

  const eventType = toNullableString(body.eventType) ?? "bot_message";
  const direction = eventType.includes("outbound") ? "outbound" : "inbound";

  const { error: interactionError } = await client.rpc("crm_add_interaction", {
    p_contact_id: contact.id,
    p_channel: "telegram",
    p_direction: direction,
    p_interaction_type: eventType,
    p_payload: {
      text: toNullableString(body.text),
      intent: toNullableString(body.intent),
      metadata: body.metadata ?? {},
      telegram_id: toNullableBigint(body.telegramId),
    },
  });

  if (interactionError) {
    return json(
      {
        error: "Contact resolved, but interaction write failed",
        contact,
        details: interactionError.message,
      },
      207,
    );
  }

  if (toNullableString(body.stageCode)) {
    const { error: stageError } = await client.rpc("crm_change_stage", {
      p_contact_id: contact.id,
      p_to_stage_code: toNullableString(body.stageCode),
      p_changed_by: "bot",
      p_reason: "bot_rule",
      p_note: "Автоматический перевод этапа через crm-bot-event",
    });

    if (stageError) {
      return json(
        {
          error: "Contact + interaction saved, but stage update failed",
          contact,
          details: stageError.message,
        },
        207,
      );
    }
  }

  return json({ ok: true, contactId: contact.id }, 200);
});
