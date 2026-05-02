/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL проекта Supabase (например https://xxxxx.supabase.co) */
  readonly VITE_SUPABASE_URL?: string;
  /** Публичный anon key (Settings → API) для входа в CRM на сайте */
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** Прямая ссылка на PDF/ZIP со «Сборниками практик» (иначе — файл из public/materials) */
  readonly VITE_PRACTICES_MATERIALS_URL?: string;
  /** Внешняя страница оплаты Точки (каталог / checkout) для страницы сборника */
  readonly VITE_TOCHKA_CHECKOUT_URL?: string;
  /** Канонический домен продакшена без завершающего слэша (https://…). Нужен для canonical, sitemap и абсолютных og:image при сборке. */
  readonly VITE_SITE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
