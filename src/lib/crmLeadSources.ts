/** Канонические коды источника лида (`crm_contacts.source_channel`). */
export const CRM_LEAD_SOURCE_CODES = ["crm", "bot", "site", "channel", "vk", "instagram", "other"] as const;

export type CrmLeadSourceCode = (typeof CRM_LEAD_SOURCE_CODES)[number];

/** Порядок: CRM → Бот → Сайт → Канал → Вк → Instagram → Другое */
export const CRM_LEAD_SOURCES: readonly { readonly code: CrmLeadSourceCode; readonly label: string }[] = [
  { code: "crm", label: "CRM" },
  { code: "bot", label: "Бот" },
  { code: "site", label: "Сайт" },
  { code: "channel", label: "Канал" },
  { code: "vk", label: "Вк" },
  { code: "instagram", label: "Instagram" },
  { code: "other", label: "Другое" },
];

const LABEL_BY_CODE: Record<CrmLeadSourceCode, string> = {
  crm: "CRM",
  bot: "Бот",
  site: "Сайт",
  channel: "Канал",
  vk: "Вк",
  instagram: "Instagram",
  other: "Другое",
};

const LEGACY_TO_CANONICAL: Record<string, CrmLeadSourceCode> = {
  crm_manual: "crm",
  telegram_bot: "bot",
  site_form: "site",
  site_quiz: "site",
  site_payment: "site",
  unknown: "other",
  "": "other",
};

function isCanon(v: string): v is CrmLeadSourceCode {
  return (CRM_LEAD_SOURCE_CODES as readonly string[]).includes(v);
}

/** Приводит сырое значение из Бода к каноническому коду для фильтров и селектов. */
export function normalizeCrmLeadSourceCode(raw: string | null | undefined): CrmLeadSourceCode {
  const t = (raw ?? "").trim().toLowerCase();
  if (!t) return "other";
  if (LEGACY_TO_CANONICAL[t]) return LEGACY_TO_CANONICAL[t]!;
  if (isCanon(t)) return t;
  return "other";
}

/** Подпись для таблиц, карточки и дашборда. */
export function crmLeadSourceLabel(raw: string | null | undefined): string {
  return LABEL_BY_CODE[normalizeCrmLeadSourceCode(raw)];
}
