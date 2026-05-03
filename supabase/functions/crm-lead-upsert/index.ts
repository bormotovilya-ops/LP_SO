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
  /**
   * Создать строку в `crm_bot_start_attribution` сразу с contact_id + phone (не гоняя attach_* с браузера).
   * Нужно для слияния при /start в боте (иначе возможен второй crm_contact только с telegram_id).
   */
  mintBotLinkContext?: boolean;
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

function randomHexToken(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function truncateField(raw: string | null, max: number): string | null {
  if (!raw) return null;
  return raw.length <= max ? raw : raw.slice(0, max);
}

/** PostgREST иногда возвращает composite как один объект или массив из одного элемента. */
function extractContactId(contact: unknown): string | null {
  if (!contact) return null;
  const row = Array.isArray(contact) ? contact[0] : contact;
  if (!row || typeof row !== "object") return null;
  const id = (row as { id?: unknown }).id;
  if (typeof id !== "string") return null;
  const t = id.trim().toLowerCase();
  return /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/.test(t) ? t : null;
}

async function mintBotLinkContextRow(
  client: ReturnType<typeof createClient>,
  opts: {
    contactId: string;
    phone: string | null;
    utmSource: string | null;
    utmMedium: string | null;
    utmCampaign: string | null;
    utmContent: string | null;
    utmTerm: string | null;
  },
): Promise<string | null> {
  const phone = truncateField(opts.phone?.trim() ?? null, 40);

  let utm_source = truncateField(opts.utmSource ?? null, 512);
  let utm_medium = truncateField(opts.utmMedium ?? null, 512);
  let utm_campaign = truncateField(opts.utmCampaign ?? null, 512);
  const utm_content = truncateField(opts.utmContent ?? null, 512);
  const utm_term = truncateField(opts.utmTerm ?? null, 512);

  if (!utm_source && !utm_medium && !utm_campaign && !utm_content && !utm_term) {
    utm_source = "site_form";
    utm_campaign = "diagnostic";
  }

  for (let attempt = 0; attempt < 8; attempt++) {
    const token = randomHexToken();
    const { error } = await client.from("crm_bot_start_attribution").insert({
      token,
      utm_source,
      utm_medium,
      utm_campaign,
      utm_content,
      utm_term,
      phone,
      contact_id: opts.contactId,
    });
    if (!error) return token;
    if ((error as { code?: string }).code === "23505") continue;
    console.error("[crm-lead-upsert] mintBotLinkContextRow:", error.message);
    return null;
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

  let botContextToken: string | null = null;
  if (body.mintBotLinkContext) {
    const cid = extractContactId(contact);
    if (cid) {
      botContextToken = await mintBotLinkContextRow(client, {
        contactId: cid,
        phone: toNullableString(body.phone),
        utmSource: toNullableString(body.utmSource),
        utmMedium: toNullableString(body.utmMedium),
        utmCampaign: toNullableString(body.utmCampaign),
        utmContent: toNullableString(body.utmContent),
        utmTerm: toNullableString(body.utmTerm),
      });
      if (!botContextToken) {
        console.warn("[crm-lead-upsert] mintBotLinkContext: token not created (see errors above)");
      }
    } else {
      console.warn("[crm-lead-upsert] mintBotLinkContext: could not read contact id from RPC result");
    }
  }

  const contactId = extractContactId(contact);

  if (body.interaction && contactId) {
    const { error: interactionError } = await client.rpc("crm_add_interaction", {
      p_contact_id: contactId,
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
          ...(botContextToken ? { botContextToken } : {}),
        },
        207,
      );
    }
  }

  return json({ ok: true, contact, ...(botContextToken ? { botContextToken } : {}) }, 200);
});
