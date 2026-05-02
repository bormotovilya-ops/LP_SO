/** Ключ в localStorage; можно слушать `storage` в других вкладках */
export const PRACTICES_STORAGE_KEY = "lp_so_practices_paid_v1";

/** Старый режим «только после webhook»: убираем при первом открытии страницы */
const PRACTICES_VERIFIED_ORDER_KEY_V2 = "lp_so_practices_verified_order_v2";

/** sessionStorage: OrderId из Init до возврата с формы оплаты */
export const PRACTICES_PENDING_ORDER_SESSION_KEY = "lp_so_pending_payment_order_v1";

export type PracticesPaidRecord = {
  /** ISO-время фиксации успешного возврата после проверки оплаты или ?pay=ok */
  paidAt: string;
  /** OrderId из payment-init — для deep link к боту */
  orderId?: string;
};

function safeParse(raw: string | null): PracticesPaidRecord | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as unknown;
    if (!o || typeof o !== "object" || Array.isArray(o)) return null;
    const paidAt = (o as { paidAt?: unknown }).paidAt;
    if (typeof paidAt !== "string" || !paidAt) return null;
    const orderIdRaw = (o as { orderId?: unknown }).orderId;
    const orderId = typeof orderIdRaw === "string" && orderIdRaw.trim() ? orderIdRaw.trim() : undefined;
    return orderId ? { paidAt, orderId } : { paidAt };
  } catch {
    return null;
  }
}

export function getPracticesPaid(): PracticesPaidRecord | null {
  if (typeof window === "undefined") return null;
  return safeParse(window.localStorage.getItem(PRACTICES_STORAGE_KEY));
}

export function setPracticesPaid(orderId?: string): PracticesPaidRecord {
  const record: PracticesPaidRecord = {
    paidAt: new Date().toISOString(),
    ...(orderId?.trim() ? { orderId: orderId.trim() } : {}),
  };
  window.localStorage.setItem(PRACTICES_STORAGE_KEY, JSON.stringify(record));
  return record;
}

export function clearPracticesPaid(): void {
  window.localStorage.removeItem(PRACTICES_STORAGE_KEY);
}

/** Убираем следы интеграции с webhook; после возврата с оплаты снова хватает ?pay=ok. */
export function migratePracticesStorageFromWebhookMode(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(PRACTICES_VERIFIED_ORDER_KEY_V2);
}
