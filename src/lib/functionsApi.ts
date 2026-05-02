const FALLBACK_FUNCTIONS_BASE_URL = "https://vvkjfaxlzlmeobgitxdj.supabase.co/functions/v1";
const rawBase = (() => {
  const fromVite = typeof __CRM_FUNCTIONS_BASE_URL__ !== "undefined" ? __CRM_FUNCTIONS_BASE_URL__.trim() : "";
  if (fromVite) return fromVite;
  return import.meta.env.VITE_SUPABASE_FUNCTIONS_BASE_URL?.trim() || FALLBACK_FUNCTIONS_BASE_URL;
})();

function readSupabaseAnonKey(): string {
  const a =
    typeof __CRM_SUPABASE_ANON_KEY__ !== "undefined" ? String(__CRM_SUPABASE_ANON_KEY__).trim() : "";
  if (a) return a;
  return String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? "").trim();
}

/** Заголовки для Edge Functions с verify_jwt = true (Supabase anon JWT). */
export function supabaseFunctionsInvokeHeaders(extra?: HeadersInit): HeadersInit {
  const anon = readSupabaseAnonKey();
  const base: Record<string, string> = {
    ...(extra as Record<string, string> | undefined),
  };
  if (anon) {
    base.Authorization = `Bearer ${anon}`;
    base.apikey = anon;
  }
  return base;
}

function normalizeBase(base: string): string {
  return base.replace(/\/+$/, "");
}

export function functionsApiUrl(path: string): string {
  if (!rawBase) {
    return path.startsWith("/") ? path : `/${path}`;
  }
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizeBase(rawBase)}${normalizedPath}`;
}
