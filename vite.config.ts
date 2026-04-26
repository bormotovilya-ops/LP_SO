import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { seoBuildPlugin } from "./vite-plugin-seo";

// Сайт на GitHub Pages: при `npm run build` переменные приходят из process.env
// (local .env, GitHub Actions). Имена как в Supabase (SUPABASE_*) или VITE_* — мержим.
// SERVICE_ROLE в клиент никогда не прокидывать.
function pickEnv(mode: string) {
  const fromFiles = loadEnv(mode, process.cwd(), "");
  const p = (key: string) => String(process.env[key] ?? fromFiles[key] ?? "").trim();
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
export default defineConfig(({ mode }) => {
  const { supabaseUrl, supabaseAnon, functionsBase } = pickEnv(mode);
  return {
    base:
      mode === "development" || process.env.VERCEL || process.env.CUSTOM_DOMAIN_BUILD === "1"
        ? "/"
        : "/LP_SO/",
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(supabaseUrl),
      "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify(supabaseAnon),
      "import.meta.env.VITE_SUPABASE_FUNCTIONS_BASE_URL": JSON.stringify(functionsBase),
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
