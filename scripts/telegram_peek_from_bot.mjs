/**
 * Посмотреть username через Bot API (getChat + getUpdates).
 *
 *   $env:TELEGRAM_BOT_TOKEN="..."
 *   node scripts/telegram_peek_from_bot.mjs 6868630781
 *
 * Опционально HTTPS_PROXY / HTTP_PROXY — только если в клиенте VPN указан
 * локальный HTTP-прокси (порт смотрите в настройках; 7890 у Clash — не у всех).
 *
 * TELEGRAM_HTTP_TIMEOUT_MS — таймаут мс (по умолчанию 90000).
 */

import { fetch, ProxyAgent } from "undici";

const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
const chatId =
  process.argv[2]?.trim() || process.env.TELEGRAM_PEEK_CHAT_ID?.trim() || "";
const timeoutMs = Math.max(
  5000,
  Number.parseInt(process.env.TELEGRAM_HTTP_TIMEOUT_MS ?? "90000", 10) || 90000,
);
const proxyUrl = (process.env.HTTPS_PROXY ?? process.env.HTTP_PROXY ?? "").trim();

if (!token) {
  console.error("Задайте TELEGRAM_BOT_TOKEN в окружении.");
  process.exit(1);
}
if (!/^\d{5,20}$/.test(chatId)) {
  console.error("Укажите числовой chat_id, например: node scripts/telegram_peek_from_bot.mjs 6868630781");
  process.exit(1);
}

const base = `https://api.telegram.org/bot${token}`;

/** После отказа прокси дальше ходим напрямую (один раз предупреждаем). */
let proxyDisabledForSession = false;

function isProxyConnRefused(err) {
  const c = err?.cause;
  return c?.code === "ECONNREFUSED" || (typeof err?.message === "string" && err.message.includes("ECONNREFUSED"));
}

async function tgJson(path, dispatcher) {
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    dispatcher,
    signal: AbortSignal.timeout(timeoutMs),
  });
  return res.json();
}

async function tgJsonMaybeFallback(path) {
  if (!proxyUrl || proxyDisabledForSession) {
    return tgJson(path, undefined);
  }
  const viaProxy = new ProxyAgent(proxyUrl);
  try {
    return await tgJson(path, viaProxy);
  } catch (e) {
    if (isProxyConnRefused(e)) {
      console.error(
        `\nПрокси ${proxyUrl} — ECONNREFUSED (на этом хосте/порту никто не слушает). ` +
          `Откройте VPN → настройки порта (HTTP / Mixed), не копируйте чужой пример 7890. ` +
          `Дальше запросы без прокси; при необходимости сбросьте: Remove-Item Env:HTTPS_PROXY\n`,
      );
      proxyDisabledForSession = true;
      return tgJson(path, undefined);
    }
    throw e;
  }
}

if (!proxyUrl) {
  console.error(
    "\nПодсказка: при таймауте к api.telegram.org можно задать HTTPS_PROXY на локальный HTTP-прокси VPN " +
      "(порт возьмите из настроек клиента, не обязательно 7890).\n",
  );
}

try {
  const getChat = await tgJsonMaybeFallback(`/getChat?chat_id=${encodeURIComponent(chatId)}`);
  console.log("\n=== getChat ===");
  console.log(JSON.stringify(getChat, null, 2));

  if (getChat.ok && getChat.result) {
    const c = getChat.result;
    console.log("\n--- кратко ---");
    console.log("id:", c.id);
    console.log("type:", c.type);
    console.log("username:", c.username ?? "(нет публичного @)");
    console.log("first_name:", c.first_name ?? "—");
    console.log("last_name:", c.last_name ?? "—");
  }

  const updates = await tgJsonMaybeFallback("/getUpdates?limit=5");
  console.log("\n=== getUpdates (при webhook часто пусто) ===");
  console.log(JSON.stringify(updates, null, 2));
} catch (e) {
  console.error(e);
  console.error(
    "\nЕсли таймаут без прокси: включите в VPN режим TUN / системный трафик. " +
      "Если ошибка прокси: исправьте HTTPS_PROXY или отключите переменную: Remove-Item Env:HTTPS_PROXY\n",
  );
  process.exit(1);
}
