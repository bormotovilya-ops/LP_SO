const rawBase = import.meta.env.VITE_SUPABASE_FUNCTIONS_BASE_URL?.trim() ?? "";

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
