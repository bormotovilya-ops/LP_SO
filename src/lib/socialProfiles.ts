export type SocialPlatform =
  | "telegram"
  | "instagram"
  | "vk"
  | "whatsapp"
  | "facebook"
  | "youtube"
  | "unknown";

export type ParsedAccountLink = {
  raw: string;
  platform: SocialPlatform;
  handle: string | null;
  canonicalUrl: string | null;
  telegramUsername: string | null;
};

const TELEGRAM_USERNAME_RE = /^[a-z][a-z0-9_]{4,31}$/;

function cleanup(raw: string): string {
  return raw.trim().replace(/\s+/g, "");
}

function normalizeUrlInput(value: string): string {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return value;
  return `https://${value}`;
}

function normalizeHandlePart(value: string): string | null {
  const cleaned = value.trim().replace(/^@+/, "").replace(/^\/+/, "").replace(/\/+$/, "");
  return cleaned || null;
}

/** Строка целиком — email (для `crm-lead-upsert` / `p_email`), без URL и userinfo. */
export function extractPlainEmail(raw: string): string | null {
  const t = raw.trim().replace(/^mailto:/i, "").split("?")[0]?.trim() ?? "";
  if (!t || /[\s<>]/.test(t)) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) return null;
  return t.toLowerCase();
}

export function parseAccountLink(rawInput: string): ParsedAccountLink {
  const raw = cleanup(rawInput);
  if (!raw) {
    return { raw: "", platform: "unknown", handle: null, canonicalUrl: null, telegramUsername: null };
  }

  if (raw.startsWith("@")) {
    const handle = normalizeHandlePart(raw);
    const tg = handle && TELEGRAM_USERNAME_RE.test(handle.toLowerCase()) ? handle.toLowerCase() : null;
    return {
      raw,
      platform: tg ? "telegram" : "unknown",
      handle,
      canonicalUrl: tg ? `https://t.me/${tg}` : null,
      telegramUsername: tg,
    };
  }

  let url: URL;
  try {
    url = new URL(normalizeUrlInput(raw));
  } catch {
    const handle = normalizeHandlePart(raw);
    const tg = handle && TELEGRAM_USERNAME_RE.test(handle.toLowerCase()) ? handle.toLowerCase() : null;
    return {
      raw,
      platform: tg ? "telegram" : "unknown",
      handle,
      canonicalUrl: null,
      telegramUsername: tg,
    };
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const firstPath = normalizeHandlePart(url.pathname.split("/").filter(Boolean)[0] ?? "");

  if (host === "t.me" || host === "telegram.me") {
    const tg = firstPath && TELEGRAM_USERNAME_RE.test(firstPath.toLowerCase()) ? firstPath.toLowerCase() : null;
    return {
      raw,
      platform: "telegram",
      handle: firstPath,
      canonicalUrl: tg ? `https://t.me/${tg}` : `https://${host}${url.pathname}`,
      telegramUsername: tg,
    };
  }

  if (host.includes("instagram.com")) {
    return {
      raw,
      platform: "instagram",
      handle: firstPath,
      canonicalUrl: `https://instagram.com/${firstPath ?? ""}`.replace(/\/$/, ""),
      telegramUsername: null,
    };
  }

  if (host === "vk.com" || host.endsWith(".vk.com")) {
    return {
      raw,
      platform: "vk",
      handle: firstPath,
      canonicalUrl: `https://vk.com/${firstPath ?? ""}`.replace(/\/$/, ""),
      telegramUsername: null,
    };
  }

  if (host === "wa.me" || host.includes("whatsapp")) {
    return {
      raw,
      platform: "whatsapp",
      handle: firstPath,
      canonicalUrl: `https://${host}${url.pathname}`,
      telegramUsername: null,
    };
  }

  if (host.includes("facebook.com")) {
    return {
      raw,
      platform: "facebook",
      handle: firstPath,
      canonicalUrl: `https://facebook.com/${firstPath ?? ""}`.replace(/\/$/, ""),
      telegramUsername: null,
    };
  }

  if (host.includes("youtube.com") || host === "youtu.be") {
    return {
      raw,
      platform: "youtube",
      handle: firstPath,
      canonicalUrl: `https://${host}${url.pathname}`,
      telegramUsername: null,
    };
  }

  return {
    raw,
    platform: "unknown",
    handle: firstPath,
    canonicalUrl: `https://${host}${url.pathname}`,
    telegramUsername: null,
  };
}
