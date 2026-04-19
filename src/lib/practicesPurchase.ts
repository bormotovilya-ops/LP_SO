/** Ключ в localStorage; можно слушать `storage` в других вкладках */
export const PRACTICES_STORAGE_KEY = "lp_so_practices_paid_v1";

/** sessionStorage: OrderId из Init до возврата с формы Т‑Банка (для уведомления в Telegram) */
export const PRACTICES_PENDING_ORDER_SESSION_KEY = "lp_so_pending_tbank_order";

export type PracticesPaidRecord = {
  /** ISO-время фиксации успешной оплаты (редирект с ?pay=ok) */
  paidAt: string;
};

function safeParse(raw: string | null): PracticesPaidRecord | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as unknown;
    if (!o || typeof o !== "object" || Array.isArray(o)) return null;
    const paidAt = (o as { paidAt?: unknown }).paidAt;
    if (typeof paidAt !== "string" || !paidAt) return null;
    return { paidAt };
  } catch {
    return null;
  }
}

export function getPracticesPaid(): PracticesPaidRecord | null {
  if (typeof window === "undefined") return null;
  return safeParse(window.localStorage.getItem(PRACTICES_STORAGE_KEY));
}

export function setPracticesPaid(): PracticesPaidRecord {
  const record: PracticesPaidRecord = { paidAt: new Date().toISOString() };
  window.localStorage.setItem(PRACTICES_STORAGE_KEY, JSON.stringify(record));
  return record;
}

export function clearPracticesPaid(): void {
  window.localStorage.removeItem(PRACTICES_STORAGE_KEY);
}
