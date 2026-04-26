import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// См. vite `define` __CRM_* (merge SUPABASE_*/VITE_*) — не полагаться на import.meta.env.VITE_*
const url = (typeof __CRM_SUPABASE_URL__ !== "undefined" ? __CRM_SUPABASE_URL__ : "").trim();
const anon = (typeof __CRM_SUPABASE_ANON_KEY__ !== "undefined" ? __CRM_SUPABASE_ANON_KEY__ : "").trim();

if (import.meta.env.DEV && (!url || !anon)) {
  console.warn(
    "[CRM] В .env или в GitHub Actions Secrets задайте URL и anon (имена SUPABASE_* или VITE_*, как в .env.example). Значения — из Supabase → Settings → API.",
  );
}

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!client) {
    client = createClient(url, anon, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return client;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(url && anon);
}
