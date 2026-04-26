import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function stripSurroundingQuotes(s: string): string {
  const t = s.trim();
  if (t.length >= 2) {
    const a = t[0];
    const b = t[t.length - 1];
    if (a === b && (a === '"' || a === "'" || a === "`")) return t.slice(1, -1).trim();
  }
  return t;
}

/** Убирает кавычки/переносы (часто при копипасте в GitHub Variables / .env). */
function cleanEnvValue(s: string): string {
  return stripSurroundingQuotes(String(s ?? "").replace(/^\uFEFF/, "").replace(/[\r\n\t]/g, "").trim());
}

function isValidHttpUrl(s: string): boolean {
  if (!s) return false;
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function readCrmUrlRaw(): string {
  const a = String(__CRM_SUPABASE_URL__ ?? "").trim();
  if (a) return a;
  return String(import.meta.env.VITE_SUPABASE_URL ?? "").trim();
}

function readCrmAnonRaw(): string {
  const a = String(__CRM_SUPABASE_ANON_KEY__ ?? "").trim();
  if (a) return a;
  return String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? "").trim();
}

export function getCrmSupabaseUrl(): string {
  const raw = readCrmUrlRaw();
  const u = cleanEnvValue(raw);
  return isValidHttpUrl(u) ? u : "";
}

function getCrmAnonKey(): string {
  return cleanEnvValue(readCrmAnonRaw());
}

let client: SupabaseClient | null = null;
let lastUrl = "";
let lastAnon = "";
let missingEnvWarned = false;

export function getSupabase(): SupabaseClient {
  const url = getCrmSupabaseUrl();
  const anon = getCrmAnonKey();
  const rawU = readCrmUrlRaw();

  if (import.meta.env.DEV && !missingEnvWarned) {
    if (!url || !anon) {
      missingEnvWarned = true;
      console.warn(
        "[CRM] В .env / GitHub Variables: SUPABASE_URL (https://...supabase.co) и SUPABASE_ANON_KEY. Pages — Actions: Variables или Secrets.",
      );
    } else if (String(rawU).trim() && !url) {
      missingEnvWarned = true;
      console.error(
        "[CRM] SUPABASE_URL невалиден после очистки. Проверь значение (без лишних кавычек/переносов):",
        String(rawU).slice(0, 120),
      );
    }
  }

  if (!url || !anon) {
    if (client && lastUrl && lastAnon) return client;
    throw new Error(
      "CRM: не задан валидный https://xxx.supabase.co URL и anon key (проверь GitHub Variables / .env, без кавычек вокруг).",
    );
  }

  if (client && lastUrl === url && lastAnon === anon) {
    return client;
  }
  lastUrl = url;
  lastAnon = anon;
  client = createClient(url, anon, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return client;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(getCrmSupabaseUrl() && getCrmAnonKey());
}
