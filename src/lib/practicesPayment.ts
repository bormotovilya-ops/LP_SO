import { functionsApiUrl, supabaseFunctionsInvokeHeaders } from "@/lib/functionsApi";
import { PRACTICES_PENDING_ORDER_SESSION_KEY } from "@/lib/practicesPurchase";

const PRACTICES_RETURN_PATH = "/practices/svoboda-ot-dolgov";

export type PracticesPaymentInitResult =
  | { ok: true; paymentUrl: string; orderId: string }
  | { ok: false; error: string };

function resolvePaymentProvider(): string {
  const fromEnv = import.meta.env.VITE_PAYMENT_PROVIDER?.trim().toLowerCase();
  if (fromEnv === "tbank" || fromEnv === "tochka") return fromEnv;
  return "tochka";
}

/** Регистрация заказа + редирект на эквайер (email уходит в чек и CRM). */
export async function initPracticesCollectionPayment(receiptEmail: string): Promise<PracticesPaymentInitResult> {
  const email = receiptEmail.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Укажите корректный email для чека" };
  }

  const siteOrigin =
    import.meta.env.VITE_SITE_URL?.trim().replace(/\/+$/, "") ||
    (typeof window !== "undefined" ? window.location.origin.replace(/\/+$/, "") : "");

  let res: Response;
  try {
    res = await fetch(functionsApiUrl("/payment-init"), {
      method: "POST",
      headers: {
        ...supabaseFunctionsInvokeHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        receiptEmail: email,
        returnPath: PRACTICES_RETURN_PATH,
        siteOrigin,
        provider: resolvePaymentProvider(),
      }),
    });
  } catch {
    return { ok: false, error: "Не удалось связаться с сервером оплаты" };
  }

  let data: {
    paymentUrl?: string;
    orderId?: string;
    error?: string;
    code?: string;
  } = {};
  try {
    data = (await res.json()) as typeof data;
  } catch {
    return { ok: false, error: "Некорректный ответ сервера оплаты" };
  }

  if (!res.ok || !data.paymentUrl || !data.orderId) {
    const msg =
      typeof data.error === "string" && data.error.trim()
        ? data.error.trim()
        : "Не удалось создать платёж";
    return { ok: false, error: msg };
  }

  if (typeof sessionStorage !== "undefined") {
    sessionStorage.setItem(PRACTICES_PENDING_ORDER_SESSION_KEY, data.orderId);
  }

  return { ok: true, paymentUrl: data.paymentUrl, orderId: data.orderId };
}
