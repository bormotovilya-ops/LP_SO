import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const TG_API = "https://api.telegram.org";

type StartIntent = "diagnostic" | "present" | "razbor";
type GiftTrack = "fear" | "money" | "relations";
type JsonObject = Record<string, unknown>;
type StartPayload = { intent: StartIntent; giftTrack: GiftTrack | null };
type GiftContent = { title: string };

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function parseStartPayload(payload: string): StartPayload | null {
  const match = /^src_site_goal_(diagnostic|present|razbor)(?:_(fear|money|relations))?$/i.exec(payload.trim());
  if (!match) return null;
  return {
    intent: match[1].toLowerCase() as StartIntent,
    giftTrack: (match[2]?.toLowerCase() as GiftTrack | undefined) ?? null,
  };
}

function getStartPayload(update: JsonObject): StartPayload | null {
  const message = update.message;
  if (!message || typeof message !== "object") return { intent: "diagnostic", giftTrack: null };
  const maybeText = (message as JsonObject).text;
  const text = typeof maybeText === "string" ? maybeText : "";
  if (!text.startsWith("/start")) return { intent: "diagnostic", giftTrack: null };
  const payload = text.replace("/start", "").trim();
  if (!payload) return { intent: "diagnostic", giftTrack: null };
  return parseStartPayload(payload) ?? { intent: "diagnostic", giftTrack: null };
}

function isStartCommand(update: JsonObject): boolean {
  const message = update.message;
  if (!message || typeof message !== "object") return false;
  const maybeText = (message as JsonObject).text;
  const text = typeof maybeText === "string" ? maybeText.trim() : "";
  return text.startsWith("/start");
}

function getMessageFrom(update: JsonObject): JsonObject | null {
  const message = update.message;
  if (!message || typeof message !== "object") return null;
  const from = (message as JsonObject).from;
  if (!from || typeof from !== "object") return null;
  return from as JsonObject;
}

function getChatId(update: JsonObject): number | null {
  const message = update.message;
  if (!message || typeof message !== "object") return null;
  const chat = (message as JsonObject).chat;
  if (!chat || typeof chat !== "object") return null;
  const id = (chat as JsonObject).id;
  return typeof id === "number" ? id : null;
}

function buildWelcomeText(intent: StartIntent | null, firstName: string): string {
  const namePart = firstName ? `${firstName}, ` : "";
  if (intent === "diagnostic") {
    return `${namePart}заявка на диагностику принята ✅\n\nСпасибо за доверие. Мы уже получили ваши данные и скоро свяжемся для согласования времени.`;
  }
  if (intent === "razbor") {
    return `${namePart}заявка на разбор принята ✅\n\nОтлично, ваш запрос зафиксирован. В ближайшее время с вами свяжутся для уточнения деталей.`;
  }
  if (intent === "present") {
    return `${namePart}подарок готов 🎁\n\nСпасибо, что прошли тест. Ваш подарок активирован, скоро пришлем материалы и следующий шаг.`;
  }
  return `${namePart}добро пожаловать! 👋\n\nМы получили вашу заявку с сайта. Чтобы не потерять связь, оставайтесь в этом боте — сюда придут следующие шаги.`;
}

function buildGiftContent(giftTrack: GiftTrack | null): GiftContent {
  if (giftTrack === "fear") {
    return {
      title: "Трансформация Стража: От Страха к Силе",
    };
  }
  if (giftTrack === "money") {
    return {
      title: "Финансовая емкость: от безопасности к масштабу",
    };
  }
  return {
    title: "Внутренние Опоры: Возвращение Домой",
  };
}

/**
 * Канал с постами-подарками: `t.me/c/3917093952/…` → API id `-1003917093952`.
 * Бот должен быть в канале (обычно админ), иначе copyMessage не сработает.
 */
const DEFAULT_GIFT_FROM_CHAT_ID = "-1003917093952";

const DEFAULT_GIFT_MESSAGE_IDS: Record<GiftTrack, number> = {
  fear: 50,
  money: 51,
  relations: 52,
};

function resolveGiftCopySource(giftTrack: GiftTrack | null): { from_chat_id: string; message_id: number } | null {
  const trackKey: GiftTrack = giftTrack === "fear" || giftTrack === "money" ? giftTrack : "relations";
  const fromRaw =
    Deno.env.get("TELEGRAM_GIFT_FROM_CHAT_ID")?.trim() ??
    Deno.env.get("TELEGRAM_GIFTS_FROM_CHAT_ID")?.trim() ??
    DEFAULT_GIFT_FROM_CHAT_ID;

  if (!/^-100\d+$/.test(fromRaw) && !/^-\d+$/.test(fromRaw)) return null;

  const idEnvKey =
    trackKey === "fear"
      ? "TELEGRAM_GIFT_MESSAGE_ID_FEAR"
      : trackKey === "money"
        ? "TELEGRAM_GIFT_MESSAGE_ID_MONEY"
        : "TELEGRAM_GIFT_MESSAGE_ID_RELATIONS";
  const midRaw = Deno.env.get(idEnvKey)?.trim();
  const message_id =
    midRaw && /^\d+$/.test(midRaw) ? Number.parseInt(midRaw, 10) : DEFAULT_GIFT_MESSAGE_IDS[trackKey];

  if (!Number.isFinite(message_id) || message_id < 1) return null;

  return { from_chat_id: fromRaw, message_id };
}

function buildGiftIntroText(gift: GiftContent): string {
  return [
    "Мини-расстановка медитация в подарок 🎁",
    "",
    `«${gift.title}»`,
    "",
    "Приятного прослушивания ❤️",
  ].join("\n");
}

function buildUnifiedGreeting(firstName: string): string {
  const namePart = firstName ? `${firstName}, ` : "";
  return `${namePart}добро пожаловать! 👋`;
}

async function sendTelegram(token: string, method: string, payload: Record<string, unknown>): Promise<boolean> {
  let response: Response;
  try {
    response = await fetch(`${TG_API}/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    return false;
  }

  try {
    const parsed = (await response.json()) as { ok?: boolean };
    return parsed.ok === true;
  } catch {
    return false;
  }
}

async function sendGiftPackage(token: string, chatId: number, giftTrack: GiftTrack | null): Promise<boolean> {
  const gift = buildGiftContent(giftTrack);
  const giftIntroText = buildGiftIntroText(gift);
  const copySource = resolveGiftCopySource(giftTrack);

  const introDelivered = await sendTelegram(token, "sendMessage", {
    chat_id: chatId,
    text: giftIntroText,
    disable_web_page_preview: true,
    protect_content: true,
  });
  if (!introDelivered) return false;

  if (!copySource) {
    return await sendTelegram(token, "sendMessage", {
      chat_id: chatId,
      text: "Подарок пока не настроен на сервере. Напишите в поддержку — пришлём файл вручную.",
      disable_web_page_preview: true,
      protect_content: true,
    });
  }

  const copied = await sendTelegram(token, "copyMessage", {
    chat_id: chatId,
    from_chat_id: copySource.from_chat_id,
    message_id: copySource.message_id,
    protect_content: true,
  });

  if (copied) return true;

  return await sendTelegram(token, "sendMessage", {
    chat_id: chatId,
    text:
      "Не удалось доставить файл автоматически. Проверьте, что бот — администратор канала с подарками, и что TELEGRAM_GIFT_FROM_CHAT_ID совпадает с id канала. Напишите в поддержку — мы отправим подарок вручную.",
    disable_web_page_preview: true,
    protect_content: true,
  });
}

async function notifyChannel(
  token: string,
  channelId: string,
  intent: StartIntent | null,
  giftTrack: GiftTrack | null,
  from: JsonObject | null,
): Promise<void> {
  const userId = typeof from?.id === "number" ? String(from.id) : "unknown";
  const username = typeof from?.username === "string" ? `@${from.username}` : "—";
  const firstName = typeof from?.first_name === "string" ? from.first_name : "";
  const text = [
    "Пользователь запустил бота",
    `Источник: site`,
    `Метка: ${intent ?? "unknown"}`,
    `Подарок: ${giftTrack ?? "default"}`,
    `User ID: ${userId}`,
    `Username: ${username}`,
    `Имя: ${firstName || "—"}`,
  ].join("\n");

  await sendTelegram(token, "sendMessage", {
    chat_id: channelId,
    text,
    disable_web_page_preview: true,
  });
}

async function saveCrmBotEvent(
  update: JsonObject,
  intent: StartIntent | null,
  giftTrack: GiftTrack | null,
): Promise<void> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRole) return;

  const from = getMessageFrom(update);
  const message = update.message && typeof update.message === "object" ? (update.message as JsonObject) : null;
  const text = typeof message?.text === "string" ? message.text : "";
  const firstName = typeof from?.first_name === "string" ? from.first_name : "";
  const lastName = typeof from?.last_name === "string" ? from.last_name : "";
  const fullName = `${firstName} ${lastName}`.trim();
  const telegramId = typeof from?.id === "number" ? from.id : null;

  if (!telegramId) return;

  const client = createClient(supabaseUrl, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  await client.rpc("crm_upsert_contact", {
    p_full_name: fullName || null,
    p_telegram_id: telegramId,
    p_source_channel: "telegram_bot",
    p_source_detail: "telegram-webhook",
    p_segment: giftTrack ?? null,
    p_comment: "Создано/обновлено из telegram-webhook",
  });

  const { data: contacts } = await client
    .from("crm_contacts")
    .select("id")
    .eq("telegram_id", telegramId)
    .limit(1);
  const contactId = contacts?.[0]?.id as string | undefined;
  if (!contactId) return;

  await client.rpc("crm_add_interaction", {
    p_contact_id: contactId,
    p_channel: "telegram",
    p_direction: "inbound",
    p_interaction_type: "bot_start",
    p_payload: {
      text,
      intent: intent ?? "unknown",
      giftTrack: giftTrack ?? "default",
      update,
    },
  });

  if (intent === "diagnostic" || intent === "razbor" || intent === "present") {
    const targetStageCode = intent === "present" ? "gift_received" : "bot_started";
    await client.rpc("crm_change_stage", {
      p_contact_id: contactId,
      p_to_stage_code: targetStageCode,
      p_changed_by: "bot",
      p_reason: "start_command",
      p_note: "Пользователь запустил сценарий в Telegram-боте",
    });
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const token = Deno.env.get("TELEGRAM_BOT_TOKEN")?.trim();
  if (!token) {
    return json({ error: "Server misconfigured" }, 500);
  }

  const secretToken = Deno.env.get("TELEGRAM_WEBHOOK_SECRET")?.trim();
  if (secretToken) {
    const headerToken = req.headers.get("x-telegram-bot-api-secret-token")?.trim();
    // Allow requests without a secret header (common when webhook was set without secret_token),
    // but still reject explicitly mismatched secrets when a header is present.
    if (headerToken && headerToken !== secretToken) {
      return json({ error: "Forbidden" }, 403);
    }
  }

  let update: JsonObject = {};
  try {
    update = (await req.json()) as JsonObject;
  } catch {
    return json({ ok: false }, 400);
  }

  if (!isStartCommand(update)) {
    return json({ ok: true, skipped: true, reason: "not_start_command" }, 200);
  }

  const startPayload = getStartPayload(update);
  const intent = startPayload?.intent ?? null;
  const giftTrack = startPayload?.giftTrack ?? null;
  const from = getMessageFrom(update);
  const chatId = getChatId(update);
  if (!chatId) return json({ ok: true, skipped: true });

  const firstName = typeof from?.first_name === "string" ? from.first_name : "";
  const greeting = buildUnifiedGreeting(firstName);
  const intentMessage = buildWelcomeText(intent, firstName);

  const firstDelivered = await sendTelegram(token, "sendMessage", {
    chat_id: chatId,
    text: greeting,
    disable_web_page_preview: true,
    protect_content: intent === "present",
  });

  if (!firstDelivered) {
    return json({ error: "Telegram delivery failed" }, 502);
  }

  const secondDelivered = await sendTelegram(token, "sendMessage", {
    chat_id: chatId,
    text: intentMessage,
    disable_web_page_preview: true,
    protect_content: intent === "present",
  });

  if (!secondDelivered) {
    return json({ error: "Telegram delivery failed" }, 502);
  }

  if (intent === "present") {
    const giftDelivered = await sendGiftPackage(token, chatId, giftTrack);
    if (!giftDelivered) {
      return json({ error: "Telegram delivery failed" }, 502);
    }
  }

  const channelId = Deno.env.get("TELEGRAM_CHANNEL_ID")?.trim();
  if (channelId) {
    await notifyChannel(token, channelId, intent, giftTrack, from);
  }

  await saveCrmBotEvent(update, intent, giftTrack);

  return json({ ok: true, intent: intent ?? "unknown" }, 200);
});
