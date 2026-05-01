import type { LeadTemperature } from "@/types/crm";

export const CRM_CONTACTS_FILTERS_LS_KEY = "lp_so:crm-contacts:v1";

export type QuickSourcePreset = "all" | "site" | "telegram" | "unknown";
export type DuplicateFilter = "any" | "only" | "hide";

const LEGAL_PAGE_SIZES = [10, 25, 50, 100] as const;
export type CrmContactsPageSize = (typeof LEGAL_PAGE_SIZES)[number];

export type CrmContactsFiltersPersist = {
  v: 1;
  filtersPanelOpen: boolean;
  quickSource: QuickSourcePreset;
  exactChannel: string;
  stageId: string;
  temperatureFilter: LeadTemperature | "__any__";
  duplicateFilter: DuplicateFilter;
  segmentExact: string;
  searchText: string;
  requireTelegramId: boolean;
  requirePhone: boolean;
  requireEmail: boolean;
  consentYesOnly: boolean;
  page: number;
  pageSize: CrmContactsPageSize;
};

const ANY = "__any__";

export const CRM_CONTACTS_ANY_VALUE = ANY;

export function coercePageSize(n: unknown): CrmContactsPageSize {
  const x = Number(n);
  if (LEGAL_PAGE_SIZES.includes(x as CrmContactsPageSize)) return x as CrmContactsPageSize;
  return 25;
}

export function loadCrmContactsFilters(): Partial<CrmContactsFiltersPersist> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CRM_CONTACTS_FILTERS_LS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as unknown;
    if (!p || typeof p !== "object" || (p as { v?: unknown }).v !== 1) return null;
    return p as Partial<CrmContactsFiltersPersist>;
  } catch {
    return null;
  }
}

export function saveCrmContactsFilters(s: CrmContactsFiltersPersist) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CRM_CONTACTS_FILTERS_LS_KEY, JSON.stringify(s));
  } catch {
    /* ignore quota */
  }
}

/** Краткая подпись для свёрнутой панели. */
export function summarizeCrmFilters(s: Omit<CrmContactsFiltersPersist, "v">): string | null {
  const parts: string[] = [];

  if (s.exactChannel !== ANY && s.exactChannel) {
    parts.push(`канал: ${s.exactChannel}`);
  } else if (s.quickSource === "site") parts.push("с сайта");
  else if (s.quickSource === "telegram") parts.push("Telegram");
  else if (s.quickSource === "unknown") parts.push("источник неизвестен");

  if (s.stageId !== ANY && s.stageId) parts.push("этап выбран");
  if (s.temperatureFilter !== ANY) parts.push(`темп.: ${s.temperatureFilter}`);
  if (s.duplicateFilter === "hide") parts.push("без дубликатов");
  if (s.duplicateFilter === "only") parts.push("дубликаты");
  if (s.segmentExact !== ANY && s.segmentExact) {
    const seg = s.segmentExact;
    parts.push(seg.length > 28 ? `сегмент: ${seg.slice(0, 26)}…` : `сегмент: ${seg}`);
  }
  const q = s.searchText?.trim();
  if (q) parts.push(`поиск`);
  if (s.requireTelegramId) parts.push("есть Telegram");
  if (s.requirePhone) parts.push("есть тел.");
  if (s.requireEmail) parts.push("есть email");
  if (s.consentYesOnly) parts.push("ПДн");

  return parts.length ? parts.join(" · ") : null;
}
