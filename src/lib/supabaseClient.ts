import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const CRM_LOG = "[CRM]";

/** Anon key в консоль не выводим целиком — только длина и префикс. */
function describeSecret(value: string): { len: number; head: string } {
  const v = String(value).trim();
  if (!v) return { len: 0, head: "—" };
  return { len: v.length, head: v.length <= 8 ? "…" : `${v.slice(0, 4)}…` };
}

let crmEnvLogged = false;

/** Один раз за загрузку: откуда пришли URL/key (define vs Vite), длины, итог, версия бандла. */
function logCrmEnvOnce(): void {
  if (crmEnvLogged) return;
  crmEnvLogged = true;

  const fromDefineUrl = String(__CRM_SUPABASE_URL__ ?? "").trim();
  const fromDefineAnon = String(__CRM_SUPABASE_ANON_KEY__ ?? "").trim();
  const fromViteUrl = String(import.meta.env.VITE_SUPABASE_URL ?? "").trim();
  const fromViteAnon = String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? "").trim();
  const url = readCrmUrl();
  const anon = readCrmAnon();
  const ok = Boolean(url && anon);

  console.info(CRM_LOG, "диагностика env (1× за сессию)", {
    mode: import.meta.env.MODE,
    prod: import.meta.env.PROD,
    build: __APP_VERSION__,
    define: { urlLen: fromDefineUrl.length, anon: describeSecret(fromDefineAnon) },
    importMetaVite: { urlLen: fromViteUrl.length, anon: describeSecret(fromViteAnon) },
    result: { url: url || null, anon: describeSecret(anon), isSupabaseConfigured: ok },
  });
  if (!ok) {
    console.warn(
      CRM_LOG,
      "пустой URL или anon после сборки → проверь GitHub Actions (Repository / Environment) и что workflow подставил значения в build.",
    );
  }
}

/** Сборка: `define` __CRM_*; запас: import.meta.env.VITE_*. После define не используем `typeof` — там уже строка. */
function readCrmUrl(): string {
  const a = String(__CRM_SUPABASE_URL__ ?? "").trim();
  if (a) return a;
  return String(import.meta.env.VITE_SUPABASE_URL ?? "").trim();
}

function readCrmAnon(): string {
  const a = String(__CRM_SUPABASE_ANON_KEY__ ?? "").trim();
  if (a) return a;
  return String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? "").trim();
}

let client: SupabaseClient | null = null;
let lastUrl = "";
let lastAnon = "";
let missingEnvWarned = false;

export function getSupabase(): SupabaseClient {
  logCrmEnvOnce();
  const url = readCrmUrl();
  const anon = readCrmAnon();
  if (import.meta.env.DEV && (!url || !anon) && !missingEnvWarned) {
    missingEnvWarned = true;
    console.warn(
      "[CRM] В .env задайте SUPABASE_URL и SUPABASE_ANON_KEY (значения из Supabase → API) или пару VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. GitHub Pages — repository Actions secrets и push в main.",
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
  logCrmEnvOnce();
  return Boolean(readCrmUrl() && readCrmAnon());
}
