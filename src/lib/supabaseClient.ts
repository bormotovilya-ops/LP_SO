import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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
  return Boolean(readCrmUrl() && readCrmAnon());
}
