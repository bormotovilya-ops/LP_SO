/** Ключ в localStorage; можно слушать `storage` в других вкладках */
export const PRACTICES_STORAGE_KEY = "lp_so_practices_paid_v1";

const PRACTICES_VERIFIED_ORDER_KEY_V2 = "lp_so_practices_verified_order_v2";

/** sessionStorage: OrderId из payment-init до возврата (если снова включат API-оплату) */
export const PRACTICES_PENDING_ORDER_SESSION_KEY = "lp_so_pending_payment_order_v1";

export const PRACTICES_DIRECT_CLIENT_TOKEN_KEY = "lp_so_practices_direct_token_v1";

export type PracticesAccessMode = "payment_init" | "tochka_checkout";

export type PracticesPaidRecord = {
  paidAt: string;
  orderId?: string;
  accessMode?: PracticesAccessMode;
  clientToken?: string;
};

const ORDER_ID_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const CLIENT_TOKEN_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isPracticesOrderId(value: string | null | undefined): boolean {
  const id = value?.trim() ?? "";
  return Boolean(id && ORDER_ID_UUID_RE.test(id));
}

export function isPracticesDirectClientToken(value: string | null | undefined): boolean {
  const t = value?.trim() ?? "";
  return Boolean(t && CLIENT_TOKEN_RE.test(t));
}

export function getPracticesPaidOrderId(): string | null {
  const id = getPracticesPaid()?.orderId?.trim();
  return isPracticesOrderId(id) ? id! : null;
}

export function getPracticesDirectClientToken(): string | null {
  const record = getPracticesPaid();
  if (record?.accessMode === "tochka_checkout" && isPracticesDirectClientToken(record.clientToken)) {
    return record.clientToken!.trim();
  }
  if (typeof sessionStorage === "undefined") return null;
  const fromSession = sessionStorage.getItem(PRACTICES_DIRECT_CLIENT_TOKEN_KEY)?.trim();
  return isPracticesDirectClientToken(fromSession) ? fromSession! : null;
}

export function canShowPracticesChannelAccess(): boolean {
  return Boolean(getPracticesPaidOrderId() || getPracticesDirectClientToken());
}

function safeParse(raw: string | null): PracticesPaidRecord | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as unknown;
    if (!o || typeof o !== "object" || Array.isArray(o)) return null;
    const paidAt = (o as { paidAt?: unknown }).paidAt;
    if (typeof paidAt !== "string" || !paidAt) return null;
    const orderIdRaw = (o as { orderId?: unknown }).orderId;
    const orderId = typeof orderIdRaw === "string" && orderIdRaw.trim() ? orderIdRaw.trim() : undefined;
    const accessModeRaw = (o as { accessMode?: unknown }).accessMode;
    const accessMode =
      accessModeRaw === "tochka_checkout" || accessModeRaw === "payment_init"
        ? accessModeRaw
        : undefined;
    const clientTokenRaw = (o as { clientToken?: unknown }).clientToken;
    const clientToken =
      typeof clientTokenRaw === "string" && clientTokenRaw.trim() ? clientTokenRaw.trim() : undefined;
    return { paidAt, ...(orderId ? { orderId } : {}), ...(accessMode ? { accessMode } : {}), ...(clientToken ? { clientToken } : {}) };
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
    accessMode: "payment_init",
    ...(orderId?.trim() ? { orderId: orderId.trim() } : {}),
  };
  window.localStorage.setItem(PRACTICES_STORAGE_KEY, JSON.stringify(record));
  return record;
}

/** Возврат с прямой страницы оплаты Точки (?pay=ok). */
export function setPracticesPaidFromTochkaCheckout(): PracticesPaidRecord {
  const clientToken = crypto.randomUUID();
  if (typeof sessionStorage !== "undefined") {
    sessionStorage.setItem(PRACTICES_DIRECT_CLIENT_TOKEN_KEY, clientToken);
  }
  const record: PracticesPaidRecord = {
    paidAt: new Date().toISOString(),
    accessMode: "tochka_checkout",
    clientToken,
  };
  window.localStorage.setItem(PRACTICES_STORAGE_KEY, JSON.stringify(record));
  return record;
}

export function clearPracticesPaid(): void {
  window.localStorage.removeItem(PRACTICES_STORAGE_KEY);
  if (typeof sessionStorage !== "undefined") {
    sessionStorage.removeItem(PRACTICES_DIRECT_CLIENT_TOKEN_KEY);
  }
}

export function migratePracticesStorageFromWebhookMode(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(PRACTICES_VERIFIED_ORDER_KEY_V2);
  const record = getPracticesPaid();
  if (record && !canShowPracticesChannelAccess()) {
    clearPracticesPaid();
  }
}
