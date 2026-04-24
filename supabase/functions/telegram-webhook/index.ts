import "@supabase/functions-js/edge-runtime.d.ts";

const TG_API = "https://api.telegram.org";

type StartIntent = "diagnostic" | "present" | "razbor";
type JsonObject = Record<string, unknown>;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function parseIntentFromPayload(payload: string): StartIntent | null {
  const match = /^src_site_goal_(diagnostic|present|razbor)$/i.exec(payload.trim());
  if (!match) return null;
  return match[1].toLowerCase() as StartIntent;
}

function getStartIntent(update: JsonObject): StartIntent | null {
  const message = update.message;
  if (!message || typeof message !== "object") return null;
  const text = typeof (message as JsonObject).text === "string" ? (message as JsonObject).text : "";
  if (!text.startsWith("/start")) return null;
  const payload = text.replace("/start", "").trim();
  if (!payload) return "diagnostic";
  return parseIntentFromPayload(payload);
}

function isStartCommand(update: JsonObject): boolean {
  const message = update.message;
  if (!message || typeof message !== "object") return false;
  const text = typeof (message as JsonObject).text === "string" ? (message as JsonObject).text.trim() : "";
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

function buildUnifiedGreeting(firstName: string): string {
  const namePart = firstName ? `${firstName}, ` : "";
  return `${namePart}добро пожаловать! 👋\n\nСпасибо, что вы с нами. Ниже отправим следующий шаг по вашей заявке.`;
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

async function notifyChannel(
  token: string,
  channelId: string,
  intent: StartIntent | null,
  from: JsonObject | null,
): Promise<void> {
  const userId = typeof from?.id === "number" ? String(from.id) : "unknown";
  const username = typeof from?.username === "string" ? `@${from.username}` : "—";
  const firstName = typeof from?.first_name === "string" ? from.first_name : "";
  const text = [
    "Пользователь запустил бота",
    `Источник: site`,
    `Метка: ${intent ?? "unknown"}`,
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
    if (headerToken !== secretToken) {
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

  const intent = getStartIntent(update);
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
  });

  if (!firstDelivered) {
    return json({ error: "Telegram delivery failed" }, 502);
  }

  const secondDelivered = await sendTelegram(token, "sendMessage", {
    chat_id: chatId,
    text: intentMessage,
    disable_web_page_preview: true,
  });

  if (!secondDelivered) {
    return json({ error: "Telegram delivery failed" }, 502);
  }

  const channelId = Deno.env.get("TELEGRAM_CHANNEL_ID")?.trim();
  if (channelId) {
    await notifyChannel(token, channelId, intent, from);
  }

  return json({ ok: true, intent: intent ?? "unknown" }, 200);
});
