/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL проекта Supabase (например https://xxxxx.supabase.co) */
  readonly VITE_SUPABASE_URL?: string;
  /** Публичный anon key (Settings → API) для входа в CRM на сайте */
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** Прямая ссылка на PDF/ZIP со «Сборниками практик» (если понадобится вне telegram-выдачи) */
  readonly VITE_PRACTICES_MATERIALS_URL?: string;
  /** Эквайер для payment-init страницы сборника: `tochka` (по умолчанию) или `tbank` */
  readonly VITE_PAYMENT_PROVIDER?: string;
  /** Первое сообщение в канале сборника (подсказка после invite) */
  readonly VITE_PRACTICES_CHANNEL_POST_URL?: string;
  /** Копейки для витрины (опционально; иначе GET /practices-config) */
  readonly VITE_PRACTICES_AMOUNT_KOPECKS?: string;
  /** Канонический домен продакшена без завершающего слэша (https://…). Нужен для canonical, sitemap и абсолютных og:image при сборке. */
  readonly VITE_SITE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
