import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { getPracticesAmountKopecks } from "./practicesPricing.ts";

type JsonRecord = Record<string, unknown>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

const DEFAULT_CATALOG_PAYMENT_LINK_ID = "bc380cff-5068-49b3-a450-73b2e54d7684";

export function getPracticesCatalogPaymentLinkId(): string {
  return Deno.env.get("TOCHKA_PRACTICES_PAYMENT_LINK_ID")?.trim() || DEFAULT_CATALOG_PAYMENT_LINK_ID;
}

export function normalizePaymentLinkId(id: string): string {
  return id.trim().toLowerCase().replace(/-/g, "");
}

export function isPracticesCatalogPaymentLink(linkId: string): boolean {
  const a = normalizePaymentLinkId(linkId);
  const b = normalizePaymentLinkId(getPracticesCatalogPaymentLinkId());
  return Boolean(a && b && a === b);
}

/** Стабильный order_id для оплат по каталогу Точки (не UUID payment-init). */
export function practicesCatalogOrderId(paymentLinkId: string): string {
  const slug = paymentLinkId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 48);
  return `tochka-catalog-${slug}`;
}

export function practicesDirectCheckoutOrderId(clientToken: string): string {
  return `tochka-direct-${clientToken.trim()}`;
}

export function fakeCheckoutEmail(orderKey: string): string {
  const slug = orderKey.replace(/[^a-zA-Z0-9]/g, "").slice(0, 24).toLowerCase();
  return `checkout+${slug}@tochka.local`;
}

export function isFakeCheckoutEmail(email: string): boolean {
  return /@tochka\.local$/i.test(email.trim());
}

function isPlausibleReceiptEmail(email: string): boolean {
  const e = email.trim().toLowerCase();
  if (!EMAIL_RE.test(e)) return false;
  if (isFakeCheckoutEmail(e)) return false;
  if (e.endsWith("@example.com") || e.endsWith("@test.com")) return false;
  return true;
}

/** Email покупателя из JWT/JSON вебхука Точки (если есть). */
export function pickReceiptEmailFromTochkaWebhook(parsed: JsonRecord): string | null {
  const found: string[] = [];

  const walk = (val: unknown, depth: number): void => {
    if (depth > 14 || val === undefined || val === null) return;
    if (typeof val === "string") {
      if (isPlausibleReceiptEmail(val)) found.push(val.trim().toLowerCase());
      return;
    }
    if (typeof val !== "object") return;
    if (Array.isArray(val)) {
      for (const item of val) walk(item, depth + 1);
      return;
    }
    const o = val as Record<string, unknown>;
    for (const [k, v] of Object.entries(o)) {
      const lk = k.toLowerCase().replace(/_/g, "");
      if (
        typeof v === "string" &&
        (lk.includes("email") || lk === "mail" || lk.includes("customercontact"))
      ) {
        if (isPlausibleReceiptEmail(v)) found.push(v.trim().toLowerCase());
      }
      walk(v, depth + 1);
    }
  };

  walk(parsed, 0);
  return found[0] ?? null;
}

export function pickPaymentLinkIdFromWebhook(parsed: JsonRecord): string {
  const direct =
    typeof parsed.paymentLinkId === "string"
      ? parsed.paymentLinkId.trim()
      : typeof parsed.payment_link_id === "string"
      ? parsed.payment_link_id.trim()
      : "";
  if (direct) return direct;

  const walk = (val: unknown, depth: number): string => {
    if (depth > 12 || val === undefined || val === null) return "";
    if (typeof val === "string") {
      const s = val.trim();
      if (isPracticesCatalogPaymentLink(s)) return s;
      return "";
    }
    if (typeof val !== "object") return "";
    if (Array.isArray(val)) {
      for (const item of val) {
        const hit = walk(item, depth + 1);
        if (hit) return hit;
      }
      return "";
    }
    for (const v of Object.values(val as Record<string, unknown>)) {
      const hit = walk(v, depth + 1);
      if (hit) return hit;
    }
    return "";
  };

  return walk(parsed, 0);
}

export async function upsertPracticesPaidOrder(
  sb: SupabaseClient,
  orderId: string,
  receiptEmail: string,
): Promise<{ created: boolean; emailUpdated: boolean }> {
  const email = receiptEmail.trim().toLowerCase();
  const { data: existing } = await sb
    .from("practices_payment_orders")
    .select("status, receipt_email")
    .eq("order_id", orderId)
    .maybeSingle();

  const wasPaid = existing?.status === "paid";
  const prevEmail = typeof existing?.receipt_email === "string" ? existing.receipt_email : "";
  const emailUpdated = Boolean(
    prevEmail && isFakeCheckoutEmail(prevEmail) && !isFakeCheckoutEmail(email),
  );

  const { error } = await sb.from("practices_payment_orders").upsert(
    {
      order_id: orderId,
      provider: "tochka",
      receipt_email: email,
      amount_kopecks: getPracticesAmountKopecks(),
      status: "paid",
      paid_at: new Date().toISOString(),
    },
    { onConflict: "order_id" },
  );
  if (error) throw error;

  return { created: !wasPaid, emailUpdated };
}

/** Недавняя оплата каталога (для связки с ?pay=ok на сайте). */
export async function findRecentPracticesCatalogPaidOrderId(
  sb: SupabaseClient,
  withinMinutes = 30,
): Promise<string | null> {
  const since = new Date(Date.now() - withinMinutes * 60 * 1000).toISOString();
  const prefix = "tochka-catalog-";
  const { data, error } = await sb
    .from("practices_payment_orders")
    .select("order_id")
    .eq("status", "paid")
    .gte("paid_at", since)
    .like("order_id", `${prefix}%`)
    .order("paid_at", { ascending: false })
    .limit(1);
  if (error || !data?.[0]?.order_id) return null;
  return String(data[0].order_id);
}
