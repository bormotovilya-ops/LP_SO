import { importJWK, jwtVerify } from "npm:jose@5";

/** Пример из официальной документации; при смене ключа заменится через URL или секрет ниже. */
const DEFAULT_JWK_URLS = [
  "https://enter.tochka.com/doc/openapi/static/keys/public",
  "https://enter.tochka.com/doc/openapi/static/keys/publickey_json",
] as const;

/**
 * Fallback JWK как в доке Точка.API (может устареть — лучше задать секрет или чтобы fetch на URL работал).
 * Обновление: страница https://developers.tochka.com/docs/tochka-api/opisanie-metodov/vebhuki
 */
const EMBEDDED_FALLBACK_JWK: Record<string, string> = {
  kty: "RSA",
  e: "AQAB",
  n:
    "rwm77av7GIttq-JF1itEgLCGEZW_zz16RlUQVYlLbJtyRSu61fCec_rroP6PxjXU2uLzUOaGaLgAPeUZAJrGuVp9nryKgbZceHckdHDYgJd9TsdJ1MYUsXaOb9joN9vmsCscBx1lwSlFQyNQsHUsrjuDk-opf6RCuazRQ9gkoDCX70HV8WBMFoVm-YWQKJHZEaIQxg_DU4gMFyKRkDGKsYKA0POL-UgWA1qkg6nHY5BOMKaqxbc5ky87muWB5nNk4mfmsckyFv9j1gBiXLKekA_y4UwG2o1pbOLpJS3bP_c95rm4M9ZBmGXqfOQhbjz8z-s9C11i-jmOQ2ByohS-ST3E5sqBzIsxxrxyQDTw--bZNhzpbciyYW4GfkkqyeYoOPd_84jPTBDKQXssvj8ZOj2XboS77tvEO1n1WlwUzh8HPCJod5_fEgSXuozpJtOggXBv0C2ps7yXlDZf-7Jar0UYc_NJEHJF-xShlqd6Q3sVL02PhSCM-ibn9DN9BKmD",
};

let cachedJwkFetchedAt = 0;
let cachedKey: CryptoKey | null = null;
const JWKS_CACHE_MS = 1000 * 60 * 60 * 24;

function pickJwkFromResponse(data: unknown): Record<string, unknown> | null {
  if (!data || typeof data !== "object") return null;
  const o = data as Record<string, unknown>;
  if (Array.isArray(o.keys) && o.keys[0] && typeof o.keys[0] === "object") {
    return o.keys[0] as Record<string, unknown>;
  }
  if (typeof o.kty === "string") return o as Record<string, unknown>;
  return null;
}

async function loadJwkFromNetwork(): Promise<CryptoKey> {
  const envUrl = Deno.env.get("TOCHKA_WEBHOOK_JWK_URL")?.trim();
  const urls = envUrl ? [envUrl] : [...DEFAULT_JWK_URLS];
  let lastErr = "";
  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        lastErr = `${url}: HTTP ${res.status}`;
        continue;
      }
      const data = (await res.json()) as unknown;
      const jwk = pickJwkFromResponse(data);
      if (!jwk) {
        lastErr = `${url}: bad JSON shape`;
        continue;
      }
      return (await importJWK(jwk, "RS256")) as CryptoKey;
    } catch (e) {
      lastErr = `${url}: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
  throw new Error(`Tochka JWK fetch failed: ${lastErr}`);
}

async function getTochkaVerifyKey(): Promise<CryptoKey> {
  const now = Date.now();
  if (cachedKey && now - cachedJwkFetchedAt < JWKS_CACHE_MS) return cachedKey;

  const embedded = Deno.env.get("TOCHKA_WEBHOOK_JWK_JSON")?.trim();
  let key: CryptoKey;
  if (embedded) {
    key = await importJWK(JSON.parse(embedded), "RS256") as CryptoKey;
  } else {
    try {
      key = await loadJwkFromNetwork();
    } catch (e) {
      console.warn(
        "[tochkaWebhookJwtVerify] network JWK failed, using embedded fallback from docs",
        e instanceof Error ? e.message : e,
      );
      key = await importJWK(EMBEDDED_FALLBACK_JWK, "RS256") as CryptoKey;
    }
  }

  cachedKey = key;
  cachedJwkFetchedAt = now;
  return cachedKey!;
}

/** Возвращает payload JWT после проверки подписи RS256 (ключ Точки). */
export async function verifyTochkaWebhookJwt(jwtCompact: string): Promise<Record<string, unknown>> {
  const trimmed = jwtCompact.trim();
  const key = await getTochkaVerifyKey();
  const { payload } = await jwtVerify(trimmed, key, {
    algorithms: ["RS256"],
  });
  return payload as Record<string, unknown>;
}
