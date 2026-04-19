/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Прямая ссылка на PDF/ZIP со «Сборниками практик» (иначе — файл из public/materials) */
  readonly VITE_PRACTICES_MATERIALS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
