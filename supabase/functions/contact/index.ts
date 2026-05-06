import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2";

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

function normalizePhone(raw: string): string {
  const cleaned = raw.replace(/[^\d+]/g, "").trim();
  return cleaned || raw.trim();
}

type ParsedSocialAccount = {
  platform: string;
  handle: string | null;
  canonicalUrl: string | null;
  telegramUsername: string | null;
};

function parseSocialAccount(raw: string): ParsedSocialAccount {
  const t = raw.trim();
  if (!t) {
    return { platform: "unknown", handle: null, canonicalUrl: null, telegramUsername: null };
  }
  if (t.startsWith("@")) {
    const h = t.replace(/^@+/, "").trim();
    const tg = /^[a-z][a-z0-9_]{4,31}$/i.test(h) ? h.toLowerCase() : null;
    return {
      platform: tg ? "telegram" : "unknown",
      handle: h || null,
      canonicalUrl: tg ? `https://t.me/${tg}` : null,
      telegramUsername: tg,
    };
  }

  const candidate = /^[a-z][a-z0-9_]{4,31}$/i.test(t) ? t.toLowerCase() : null;
  if (candidate) {
    return {
      platform: "telegram",
      handle: candidate,
      canonicalUrl: `https://t.me/${candidate}`,
      telegramUsername: candidate,
    };
  }

  let url: URL | null = null;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : `https://${t}`);
  } catch {
    url = null;
  }
  if (!url) return { platform: "unknown", handle: null, canonicalUrl: null, telegramUsername: null };

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const firstPath = url.pathname.split("/").filter(Boolean)[0] ?? null;
  const normalizedHandle = firstPath ? firstPath.replace(/^@+/, "") : null;

  if (host === "t.me" || host === "telegram.me") {
    const tg = normalizedHandle && /^[a-z][a-z0-9_]{4,31}$/i.test(normalizedHandle)
      ? normalizedHandle.toLowerCase()
      : null;
    return {
      platform: "telegram",
      handle: normalizedHandle,
      canonicalUrl: tg ? `https://t.me/${tg}` : `https://${host}${url.pathname}`,
      telegramUsername: tg,
    };
  }

  if (host.includes("instagram.com")) {
    return {
      platform: "instagram",
      handle: normalizedHandle,
      canonicalUrl: `https://instagram.com/${normalizedHandle ?? ""}`.replace(/\/$/, ""),
      telegramUsername: null,
    };
  }
  if (host === "vk.com" || host.endsWith(".vk.com")) {
    return {
      platform: "vk",
      handle: normalizedHandle,
      canonicalUrl: `https://vk.com/${normalizedHandle ?? ""}`.replace(/\/$/, ""),
      telegramUsername: null,
    };
  }
  if (host === "wa.me" || host.includes("whatsapp")) {
    return {
      platform: "whatsapp",
      handle: normalizedHandle,
      canonicalUrl: `https://${host}${url.pathname}`,
      telegramUsername: null,
    };
  }

  return {
    platform: "unknown",
    handle: normalizedHandle,
    canonicalUrl: `https://${host}${url.pathname}`,
    telegramUsername: null,
  };
}

/** UUID уже созданный `crm-lead-upsert` — не вызываем второй upsert из этой функции (избегаем дублей контактов). */
const CRM_CONTACT_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function pickStageCode(eventType: string): string {
  if (eventType === "quiz_completed") return "interest_confirmed";
  if (eventType === "gift_received") return "new_lead";
  if (eventType === "bot_started") return "new_lead";
  return "interest_confirmed";
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
  const accountLink = String(body.accountLink ?? "").trim().slice(0, MAX_FIELD);
  const goal = String(body.goal ?? "").trim().slice(0, MAX_FIELD);
  const message = String(body.message ?? "").trim().slice(0, MAX_FIELD);
  const crmEventType = String(body.crmEventType ?? "diagnostic_request_submitted")
    .trim()
    .toLowerCase()
    .slice(0, 80);
  const quizNumber = body.quizNumber;
  const giftTrack = String(body.giftTrack ?? "").trim().slice(0, 40);
  const utmSource = String(body.utmSource ?? "").trim().slice(0, 512);
  const utmMedium = String(body.utmMedium ?? "").trim().slice(0, 512);
  const utmCampaign = String(body.utmCampaign ?? "").trim().slice(0, 512);
  const utmContent = String(body.utmContent ?? "").trim().slice(0, 512);
  const utmTerm = String(body.utmTerm ?? "").trim().slice(0, 512);
  const crmContactIdIn = String(body.crmContactId ?? "").trim();

  if (!name || !contact) {
    return json({ error: "Invalid payload" }, 400);
  }

  const parsedAccount = parseSocialAccount(accountLink);

  const lines = [
    "<b>Новая заявка с сайта</b>",
    "",
    `<b>Имя:</b> ${escapeHtml(name)}`,
    `<b>Контакт:</b> ${escapeHtml(contact)}`,
    `<b>Удобный канал:</b> ${escapeHtml(messenger || "—")}`,
    `<b>Ссылка на аккаунт:</b> ${escapeHtml(accountLink || "—")}`,
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

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (supabaseUrl && serviceRole) {
    try {
      const supabase = createClient(supabaseUrl, serviceRole, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      const normalizedContact = normalizePhone(contact);
      const telegramUsernameRpc = parsedAccount.telegramUsername;
      const telegramHandle = telegramUsernameRpc
        ? `@${telegramUsernameRpc}`
        : accountLink.trim()
          ? accountLink.trim()
          : null;

      let contactId: string | null = CRM_CONTACT_ID_RE.test(crmContactIdIn)
        ? crmContactIdIn.toLowerCase()
        : null;

      if (!contactId) {
        const { data: resolvedContact } = await supabase.rpc("crm_upsert_contact", {
          p_full_name: name || null,
          p_phone: normalizedContact || null,
          p_email: null,
          p_telegram_id: null,
          p_telegram_username: telegramUsernameRpc,
          p_source_channel: "site",
          p_source_detail: crmEventType || "diagnostic_request_submitted",
          p_utm_source: utmSource || null,
          p_utm_medium: utmMedium || null,
          p_utm_campaign: utmCampaign || null,
          p_utm_content: utmContent || null,
          p_utm_term: utmTerm || null,
          p_segment: giftTrack || null,
          p_owner_user_id: null,
          p_consent_personal_data: true,
          p_comment: null,
        });
        contactId = (resolvedContact as { id?: string } | null)?.id ?? null;
      } else if (telegramUsernameRpc) {
        const { data: row } = await supabase.from("crm_contacts").select("telegram_username").eq("id", contactId).maybeSingle();
        const cur = typeof row?.telegram_username === "string" ? row.telegram_username.trim() : "";
        if (!cur) {
          await supabase.from("crm_contacts").update({ telegram_username: telegramUsernameRpc }).eq("id", contactId);
        }
      }

      if (contactId) {
        await supabase.rpc("crm_add_interaction", {
          p_contact_id: contactId,
          p_channel: "site",
          p_direction: "inbound",
          p_interaction_type: crmEventType || "diagnostic_request_submitted",
          p_payload: {
            goal: goal || null,
            message: message || null,
            messenger: messenger || null,
            telegram_handle: telegramHandle,
            account_link: accountLink || null,
            account_platform: parsedAccount.platform,
            account_handle: parsedAccount.handle,
            account_url: parsedAccount.canonicalUrl,
            quiz_number: typeof quizNumber === "number" ? quizNumber : null,
            gift_track: giftTrack || null,
          },
        });

        await supabase.rpc("crm_change_stage", {
          p_contact_id: contactId,
          p_to_stage_code: pickStageCode(crmEventType),
          p_changed_by: "system",
          p_reason: "site_event",
          p_note: "Автоматический этап по событию из формы сайта",
        });
      }
    } catch (error) {
      console.error("[contact] CRM sync failed:", error);
    }
  }

  return json({ ok: true });
});
