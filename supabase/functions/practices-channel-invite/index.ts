import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createServiceSupabase } from "@lp_so/shared/createServiceSupabase.ts";
import { recordPracticesChannelInviteCrm, recordPracticesPaidCrm } from "@lp_so/shared/practicesPaidCrm.ts";
import {
  practicesGetChannelInviteLink,
  practicesIsPaid,
  practicesSaveChannelInviteLink,
} from "@lp_so/shared/practicesOrdersRepo.ts";
import { createOneTimeChatInviteLink } from "@lp_so/shared/telegramBotApi.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** Канал сборника: t.me/c/3454870164/40 → -1003454870164 */
const DEFAULT_PRACTICES_CHANNEL_ID = "-1003454870164";

const INVITE_TTL_SEC = 7 * 24 * 60 * 60;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function looksLikeUuidV4(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s.trim());
}

function resolvePracticesChannelId(): string | null {
  const raw =
    Deno.env.get("TELEGRAM_PRACTICES_CHANNEL_ID")?.trim() ??
    Deno.env.get("TELEGRAM_PRACTICES_FROM_CHAT_ID")?.trim() ??
    DEFAULT_PRACTICES_CHANNEL_ID;
  if (!/^-100\d+$/.test(raw) && !/^-\d+$/.test(raw)) return null;
  return raw;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  let body: { orderId?: unknown } = {};
  try {
    body = (await req.json()) as { orderId?: unknown };
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const orderId = typeof body.orderId === "string" ? body.orderId.trim() : "";
  if (!orderId || !looksLikeUuidV4(orderId)) {
    return json({ error: "Invalid orderId" }, 400);
  }

  const token = Deno.env.get("TELEGRAM_BOT_TOKEN")?.trim();
  const channelId = resolvePracticesChannelId();
  if (!token || !channelId) {
    console.error("[practices-channel-invite] Missing TELEGRAM_BOT_TOKEN or channel id");
    return json({ ok: false, error: "Channel invite is not configured" }, 503);
  }

  try {
    const sb = createServiceSupabase();
    const paid = await practicesIsPaid(sb, orderId);
    if (!paid) {
      return json({ ok: false, pending: true, error: "Payment not confirmed" }, 402);
    }

    const existing = await practicesGetChannelInviteLink(sb, orderId);
    if (existing) {
      return json({ ok: true, inviteLink: existing, reused: true }, 200);
    }

    const expireDateUnix = Math.floor(Date.now() / 1000) + INVITE_TTL_SEC;
    const created = await createOneTimeChatInviteLink(token, channelId, {
      name: `p-${orderId.slice(0, 8)}`,
      expireDateUnix,
    });

    if (!created.ok || !created.invite_link) {
      console.error("[practices-channel-invite] createChatInviteLink failed", created.description);
      return json(
        {
          ok: false,
          error: "Could not create channel invite",
          details: created.description ?? null,
        },
        503,
      );
    }

    await practicesSaveChannelInviteLink(sb, orderId, created.invite_link);

    try {
      await recordPracticesPaidCrm(sb, orderId);
    } catch (crmE) {
      console.error("[practices-channel-invite] recordPracticesPaidCrm failed", crmE);
    }
    try {
      await recordPracticesChannelInviteCrm(sb, orderId);
    } catch (crmE) {
      console.error("[practices-channel-invite] recordPracticesChannelInviteCrm failed", crmE);
    }

    return json({
      ok: true,
      inviteLink: created.invite_link,
      expiresInSeconds: INVITE_TTL_SEC,
      reused: false,
    }, 200);
  } catch (e) {
    console.error("[practices-channel-invite]", e);
    return json({ ok: false, error: "Server error" }, 500);
  }
});
