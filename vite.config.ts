import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { seoBuildPlugin } from "./vite-plugin-seo";

// GitHub Pages: repo URL is /LP_SO/ — use subpath in production CI builds only.
// Vercel sets VERCEL=1 during build — site is served at domain root, base must be "/".
// For custom domain on GitHub Pages set CUSTOM_DOMAIN_BUILD=1 to also use "/".
// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  base:
    mode === "development" || process.env.VERCEL || process.env.CUSTOM_DOMAIN_BUILD === "1"
      ? "/"
      : "/LP_SO/",
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
}));
