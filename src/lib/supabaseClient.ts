import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? "";
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? "";

if (import.meta.env.DEV && (!url || !anon)) {
  console.warn(
    "[CRM] Добавьте VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY (см. .env.example) для входа в админку.",
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
