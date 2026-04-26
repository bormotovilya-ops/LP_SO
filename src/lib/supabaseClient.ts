import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Сборка: vite `define` __CRM_* из SUPABASE_* / VITE_*; запас: import.meta.env.VITE_* */
function readCrmUrl(): string {
  if (typeof __CRM_SUPABASE_URL__ !== "undefined" && String(__CRM_SUPABASE_URL__).trim()) {
    return String(__CRM_SUPABASE_URL__).trim();
  }
  return String(import.meta.env.VITE_SUPABASE_URL ?? "").trim();
}

function readCrmAnon(): string {
  if (typeof __CRM_SUPABASE_ANON_KEY__ !== "undefined" && String(__CRM_SUPABASE_ANON_KEY__).trim()) {
    return String(__CRM_SUPABASE_ANON_KEY__).trim();
  }
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
      "[CRM] В корневом .env задайте SUPABASE_URL и SUPABASE_ANON_KEY (или VITE_*) — значения из Supabase → API. Для GitHub Pages — Secrets + пересборка.",
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
