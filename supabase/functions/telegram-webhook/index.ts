import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

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

/** Совпадает с `PRACTICES_COLLECTION_BOT_START_PAYLOAD` на фронте (прямая оплата Точка → `?pay=ok`). */
const PRACTICES_COLLECTION_DIRECT_START = "src_site_practices_debt_free";

function startCommandPayloadText(update: JsonObject): string | null {
  const message = update.message;
  if (!message || typeof message !== "object") return null;
  const maybeText = (message as JsonObject).text;
  const text = typeof maybeText === "string" ? maybeText.trim() : "";
  if (!/^\/start\b/i.test(text)) return null;
  return text.replace(/^\/start\s*/i, "").trim();
}

/** `src_site_practices_<uuid>` — ledger payment-init; `src_site_practices_debt_free` — возврат с сайта после Точки. */
function parsePracticesCollectionStart(
  update: JsonObject,
): { mode: "ledger"; orderId: string } | { mode: "direct" } | null {
  const payload = startCommandPayloadText(update);
  if (!payload) return null;
  const ledger =
    /^src_site_practices_([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.exec(
      payload,
    );
  if (ledger) return { mode: "ledger", orderId: ledger[1]! };
  if (payload.toLowerCase() === PRACTICES_COLLECTION_DIRECT_START) return { mode: "direct" };
  return null;
}

// ----- Сборник практик: только здесь (без supabase/functions/_shared) -----

/** Service role только для проверки `practices_payment_orders` при start с UUID заказа. */
function practicesCollectionServiceSupabase(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL")?.trim();
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function practicesCollectionLedgerIsPaid(sb: SupabaseClient, orderId: string): Promise<boolean> {
  const { data, error } = await sb
    .from("practices_payment_orders")
    .select("order_id")
    .eq("order_id", orderId)
    .eq("status", "paid")
    .maybeSingle();
  if (error) throw error;
  return Boolean(data?.order_id);
}

const DEFAULT_PRACTICES_COLLECTION_FROM_CHAT_ID = "-1003917093952";
const DEFAULT_PRACTICES_COLLECTION_MESSAGE_ID = 59;

/** Пост в канале (как t.me/c/3917093952/59); бот — админ канала. */
function resolvePracticesCollectionCopySource(): { from_chat_id: string; message_id: number } | null {
  const fromRaw =
    Deno.env.get("TELEGRAM_PRACTICES_FROM_CHAT_ID")?.trim() ??
    Deno.env.get("TELEGRAM_GIFT_FROM_CHAT_ID")?.trim() ??
    DEFAULT_PRACTICES_COLLECTION_FROM_CHAT_ID;

  if (!/^-100\d+$/.test(fromRaw) && !/^-\d+$/.test(fromRaw)) return null;

  const midRaw = Deno.env.get("TELEGRAM_PRACTICES_MESSAGE_ID")?.trim();
  const message_id =
    midRaw && /^\d+$/.test(midRaw) ? Number.parseInt(midRaw, 10) : DEFAULT_PRACTICES_COLLECTION_MESSAGE_ID;

  if (!Number.isFinite(message_id) || message_id < 1) return null;

  return { from_chat_id: fromRaw, message_id };
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

async function savePracticesCollectionTelegramCrm(
  update: JsonObject,
  opts: {
    orderId: string | null;
    orderSource: "payment_ledger" | "tochka_page_return";
    copyDelivered: boolean;
  },
): Promise<void> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRole) return;

  const from = getMessageFrom(update);
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
    p_phone: null,
    p_email: null,
    p_telegram_id: telegramId,
    p_source_channel: "telegram_bot",
    p_source_detail: "practices_collection_delivery",
    p_utm_source: null,
    p_utm_medium: null,
    p_utm_campaign: null,
    p_utm_content: null,
    p_utm_term: null,
    p_segment: null,
    p_owner_user_id: null,
    p_consent_personal_data: false,
    p_comment: "Получение материалов сборника после оплаты",
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
    p_direction: "outbound",
    p_interaction_type: "outbound_practices_collection_file",
    p_payload: {
      orderId: opts.orderId,
      orderSource: opts.orderSource,
      copyDelivered: opts.copyDelivered,
      product: "practices_svoboda_ot_dolgov",
    },
  });

  const note =
    opts.orderSource === "tochka_page_return"
      ? "Оплата через страницу Точки, материалы выданы из бота"
      : opts.orderId
        ? `Оплачен сборник (заказ ${opts.orderId.slice(0, 8)}…), материалы выданы из бота`
        : "Оплачен сборник, материалы выданы из бота";

  const { error: stageErr } = await client.rpc("crm_change_stage", {
    p_contact_id: contactId,
    p_to_stage_code: "paid",
    p_changed_by: "system",
    p_reason: "practices_collection_delivered",
    p_note: note,
  });
  if (stageErr) {
    console.warn("[telegram-webhook] practices collection crm_change_stage skipped", stageErr.message);
  }
}

async function attemptCopyPracticesPostToChat(token: string, chatId: number): Promise<boolean> {
  const copySource = resolvePracticesCollectionCopySource();
  if (!copySource) {
    await sendTelegram(token, "sendMessage", {
      chat_id: chatId,
      text: "Выдача не настроена на сервере. Напишите в поддержку — пришлём файл.",
      disable_web_page_preview: true,
      protect_content: true,
    });
    return false;
  }

  const copied = await sendTelegram(token, "copyMessage", {
    chat_id: chatId,
    from_chat_id: copySource.from_chat_id,
    message_id: copySource.message_id,
    protect_content: true,
  });

  if (!copied) {
    await sendTelegram(token, "sendMessage", {
      chat_id: chatId,
      text:
        "Не удалось скопировать файл из канала. Проверьте, что бот — администратор канала с материалами.",
      disable_web_page_preview: true,
      protect_content: true,
    });
  }

  return copied;
}

async function deliverPracticesAfterTochkaPageReturn(token: string, chatId: number): Promise<boolean> {
  const opened = await sendTelegram(token, "sendMessage", {
    chat_id: chatId,
    text:
      "Материалы сборника «Свобода от долгов» — ниже 📎",
    disable_web_page_preview: true,
    protect_content: true,
  });
  if (!opened) return false;

  return await attemptCopyPracticesPostToChat(token, chatId);
}

async function deliverPracticesCollectionFromChannel(
  token: string,
  chatId: number,
  orderId: string,
): Promise<{ paid: boolean; copyDelivered: boolean }> {
  let paid = false;
  let copyDelivered = false;
  try {
    const sb = practicesCollectionServiceSupabase();
    paid = await practicesCollectionLedgerIsPaid(sb, orderId);
  } catch (e) {
    console.error("[telegram-webhook] practicesCollectionLedgerIsPaid failed", e);
    await sendTelegram(token, "sendMessage", {
      chat_id: chatId,
      text: "Сервис временно недоступен. Напишите в поддержку — пришлём материалы вручную.",
      disable_web_page_preview: true,
      protect_content: true,
    });
    return { paid: false, copyDelivered: false };
  }

  if (!paid) {
    await sendTelegram(token, "sendMessage", {
      chat_id: chatId,
      text:
        "Пока не видим успешную оплату по этому заказу. Если только что оплатили, подождите минуту и нажмите /start ещё раз с той же ссылкой со страницы. Или напишите в поддержку.",
      disable_web_page_preview: true,
      protect_content: true,
    });
    return { paid: false, copyDelivered: false };
  }

  const opened = await sendTelegram(token, "sendMessage", {
    chat_id: chatId,
    text:
      `Материалы сборника «Свобода от долгов» — ниже 📎 (тот же способ выдачи, что и медитации-поларки из канала). Заказ: ${orderId.slice(0, 8)}…`,
    disable_web_page_preview: true,
    protect_content: true,
  });
  if (!opened) return { paid: true, copyDelivered: false };

  copyDelivered = await attemptCopyPracticesPostToChat(token, chatId);

  return { paid: true, copyDelivered };
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
    const targetStageCode =
      intent === "present" ? "new_lead" : "interest_confirmed";
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

  const practicesStart = parsePracticesCollectionStart(update);
  if (practicesStart) {
    const chatIdPc = getChatId(update);
    if (!chatIdPc) return json({ ok: true, skipped: true });

    if (practicesStart.mode === "ledger") {
      const { paid, copyDelivered } = await deliverPracticesCollectionFromChannel(
        token,
        chatIdPc,
        practicesStart.orderId,
      );
      if (paid) {
        await savePracticesCollectionTelegramCrm(update, {
          orderId: practicesStart.orderId,
          orderSource: "payment_ledger",
          copyDelivered,
        });
      }
      return json(
        {
          ok: true,
          flow: "practices_collection",
          mode: "ledger",
          orderId: practicesStart.orderId,
          paid,
          copyDelivered,
        },
        200,
      );
    }

    const copyDelivered = await deliverPracticesAfterTochkaPageReturn(token, chatIdPc);
    await savePracticesCollectionTelegramCrm(update, {
      orderId: null,
      orderSource: "tochka_page_return",
      copyDelivered,
    });

    return json(
      {
        ok: true,
        flow: "practices_collection",
        mode: "direct_tochka",
        copyDelivered,
      },
      200,
    );
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
