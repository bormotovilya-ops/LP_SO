/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Прямая ссылка на PDF/ZIP со «Сборниками практик» (иначе — файл из public/materials) */
  readonly VITE_PRACTICES_MATERIALS_URL?: string;
  /** Канонический домен продакшена без завершающего слэша (https://…). Нужен для canonical, sitemap и абсолютных og:image при сборке. */
  readonly VITE_SITE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
