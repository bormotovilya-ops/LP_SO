import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { seoBuildPlugin } from "./vite-plugin-seo";

/** Ключи CRM для .env: не использовать loadEnv(..., ''), в Vite это даёт весь process.env. */
const CRM_ENV_KEYS = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "FUNCTIONS_BASE_URL",
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
  "VITE_SUPABASE_FUNCTIONS_BASE_URL",
] as const;

function readCrmKeysFromEnvFiles(envDir: string, mode: string): Record<string, string> {
  const out: Record<string, string> = {};
  const allow = new Set<string>(CRM_ENV_KEYS);
  for (const f of [join(envDir, ".env"), join(envDir, ".env.local"), join(envDir, `.env.${mode}`), join(envDir, `.env.${mode}.local`)]) {
    if (!existsSync(f)) continue;
    for (const raw of readFileSync(f, "utf-8").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq < 0) continue;
      const k = line.slice(0, eq).trim();
      if (!allow.has(k)) continue;
      let v = line.slice(eq + 1).trim();
      if (v.length >= 2) {
        const q = v[0];
        if ((q === '"' && v.endsWith('"')) || (q === "'" && v.endsWith("'"))) v = v.slice(1, -1);
      }
      out[k] = v;
    }
  }
  return out;
}

// Сайт на GitHub Pages: `npm run build` — process.env (Actions), .env* (Vite loadEnv VITE_ + явный parse SUPABASE_*).
// SERVICE_ROLE в клиент никогда не прокидывать.
function pickEnv(mode: string) {
  const fromFiles = readCrmKeysFromEnvFiles(process.cwd(), mode);
  const viteFromFiles = loadEnv(mode, process.cwd(), "VITE_");
  const p = (key: string) => String(process.env[key] ?? fromFiles[key] ?? viteFromFiles[key] ?? "").trim();
  const supabaseUrl = p("SUPABASE_URL") || p("VITE_SUPABASE_URL");
  const supabaseAnon = p("SUPABASE_ANON_KEY") || p("VITE_SUPABASE_ANON_KEY");
  let functionsBase = p("VITE_SUPABASE_FUNCTIONS_BASE_URL") || p("FUNCTIONS_BASE_URL");
  if (!functionsBase && supabaseUrl) {
    functionsBase = `${supabaseUrl.replace(/\/+$/, "")}/functions/v1`;
  }
  return { supabaseUrl, supabaseAnon, functionsBase };
}

// GitHub Pages: repo URL is /LP_SO/ — use subpath in production CI builds only.
// На Vercel (если снова) VERCEL=1 — корень сайта. На GitHub Pages: CUSTOM_DOMAIN_BUILD=1 в workflow.
// For custom domain on GitHub Pages set CUSTOM_DOMAIN_BUILD=1 to also use "/".
// https://vitejs.dev/config/
const appVersion = JSON.parse(readFileSync(path.join(__dirname, "package.json"), "utf-8")).version as string;

export default defineConfig(({ mode }) => {
  const { supabaseUrl, supabaseAnon, functionsBase } = pickEnv(mode);
  if (process.env.CI === "true" && process.env.CUSTOM_DOMAIN_BUILD === "1" && (!supabaseUrl || !supabaseAnon)) {
    throw new Error(
      "GitHub CI: пустой CRM. Секреты должны быть в **Repository** Actions (или в Environment, см. build job) — SUPABASE_URL и SUPABASE_ANON_KEY; при необходимости VITE_*. См. логи шага Check/Debug CRM; Environment-only без environment у job = пусто.",
    );
  }
  return {
    base:
      mode === "development" || process.env.VERCEL || process.env.CUSTOM_DOMAIN_BUILD === "1"
        ? "/"
        : "/LP_SO/",
    // Не класть в import.meta.env.VITE_* — плагин env перезаписывает, в Pages приходили пустые.
    define: {
      __APP_VERSION__: JSON.stringify(appVersion),
      __CRM_SUPABASE_URL__: JSON.stringify(supabaseUrl),
      __CRM_SUPABASE_ANON_KEY__: JSON.stringify(supabaseAnon),
      __CRM_FUNCTIONS_BASE_URL__: JSON.stringify(functionsBase),
    },
    server: {
      host: "::",
      port: 8080,
      hmr: {
        overlay: false,
      },
    },
    plugins: [react(), mode === "development" && componentTagger(), seoBuildPlugin()].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
      dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
    },
  };
});
