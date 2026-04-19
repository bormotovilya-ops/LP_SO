import type { Plugin } from "vite";
import fs from "node:fs";
import path from "node:path";

function trimTrailingSlash(s: string): string {
  return s.replace(/\/+$/, "");
}

/** Canonical site root with trailing slash, e.g. https://a.ru/ or https://a.ru/LP_SO/ */
function absoluteSiteRoot(site: string, viteBase: string): string {
  const origin = trimTrailingSlash(site);
  const rel = viteBase.replace(/^\//, "").replace(/\/+$/, "");
  const path = rel ? `${rel}/` : "";
  const u = new URL(path, `${origin}/`);
  let href = u.href;
  if (!href.endsWith("/")) href += "/";
  return href;
}

function absoluteAsset(site: string, viteBase: string, file: string): string {
  return new URL(file, absoluteSiteRoot(site, viteBase)).href;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function relativeRootUrl(viteBase: string): string {
  return viteBase === "/" || viteBase === "" ? "/" : viteBase;
}

function relativeGraphIds(viteBase: string): { websiteId: string; personId: string; rootUrl: string } {
  const rootUrl = relativeRootUrl(viteBase);
  if (rootUrl === "/") {
    return { websiteId: "/#website", personId: "/#person", rootUrl: "/" };
  }
  const baseNoSlash = rootUrl.replace(/\/$/, "");
  return {
    websiteId: `${baseNoSlash}/#website`,
    personId: `${baseNoSlash}/#person`,
    rootUrl,
  };
}

const DEFAULT_ROBOTS = [
  "# Sitemap: … добавляется при сборке, если задана переменная VITE_SITE_URL (https://ваш-домен).",
  "",
  "User-agent: Googlebot",
  "Allow: /",
  "",
  "User-agent: Bingbot",
  "Allow: /",
  "",
  "User-agent: Twitterbot",
  "Allow: /",
  "",
  "User-agent: facebookexternalhit",
  "Allow: /",
  "",
  "User-agent: *",
  "Allow: /",
];

export function seoBuildPlugin(): Plugin {
  let viteBase = "/";
  let outDir = "dist";

  return {
    name: "seo-build",
    apply: "build",
    configResolved(config) {
      viteBase = config.base;
      outDir = path.resolve(config.root, config.build.outDir);
    },
    transformIndexHtml: {
      order: "post",
      handler(html) {
        const site = process.env.VITE_SITE_URL?.trim();
        if (!site) return html;

        const origin = trimTrailingSlash(site);
        const home = absoluteSiteRoot(origin, viteBase);
        const ogImage = absoluteAsset(origin, viteBase, "favicon.png");
        const { websiteId, personId, rootUrl } = relativeGraphIds(viteBase);
        const absWebsiteId = `${home}#website`;
        const absPersonId = `${home}#person`;

        let out = html;
        out = out.replace(
          "</title>",
          `</title>\n    <link rel="canonical" href="${escapeXml(home)}" />\n    <meta property="og:url" content="${escapeXml(home)}" />`,
        );
        out = out.replace(
          /<meta property="og:image" content="[^"]*" \/>/,
          `<meta property="og:image" content="${escapeXml(ogImage)}" />`,
        );
        out = out.replace(
          /<meta name="twitter:image" content="[^"]*" \/>/,
          `<meta name="twitter:image" content="${escapeXml(ogImage)}" />`,
        );

        out = out.split(`"@id": "${websiteId}"`).join(`"@id": "${absWebsiteId}"`);
        out = out.split(`"@id": "${personId}"`).join(`"@id": "${absPersonId}"`);
        out = out.split(`"url": "${rootUrl}"`).join(`"url": "${home}"`);

        return out;
      },
    },
    closeBundle() {
      const site = process.env.VITE_SITE_URL?.trim();
      const lines = [...DEFAULT_ROBOTS];
      if (site) {
        const origin = trimTrailingSlash(site);
        const home = absoluteSiteRoot(origin, viteBase);
        const sitemapHref = new URL("sitemap.xml", home).href;
        lines.push("", `Sitemap: ${sitemapHref}`);
        const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${escapeXml(home)}</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
`;
        fs.writeFileSync(path.join(outDir, "sitemap.xml"), sitemap, "utf8");
      }
      fs.writeFileSync(path.join(outDir, "robots.txt"), `${lines.join("\n")}\n`, "utf8");
    },
  };
}
