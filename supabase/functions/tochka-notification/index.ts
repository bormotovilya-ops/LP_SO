import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createServiceSupabase } from "../_shared/createServiceSupabase.ts";
import { practicesGetReceiptEmail, practicesMarkPaid } from "../_shared/practicesOrdersRepo.ts";
import { recordPracticesPaidCrm } from "../_shared/practicesPaidCrm.ts";
import { sendPracticesPurchaseTelegram } from "../_shared/practicesPaidTelegram.ts";
import {
  fakeCheckoutEmail,
  isPracticesCatalogPaymentLink,
  pickPaymentLinkIdFromWebhook,
  pickReceiptEmailFromTochkaWebhook,
  practicesCatalogOrderId,
  upsertPracticesPaidOrder,
} from "../_shared/practicesTochkaCatalog.ts";
import { verifyTochkaWebhookJwt } from "../_shared/tochkaWebhookJwtVerify.ts";

type JsonRecord = Record<string, unknown>;

function resolveBearer(req: Request): string {
  const auth = req.headers.get("authorization")?.trim() || "";
  if (!auth.toLowerCase().startsWith("bearer ")) return "";
  return auth.slice(7).trim();
}

function looksLikeJwtCompact(raw: string): boolean {
  const p = raw.trim();
  const parts = p.split(".");
  return parts.length === 3 && parts.every((x) => x.length > 0);
}

async function readBody(req: Request): Promise<{ parsed: JsonRecord; raw: string }> {
  const raw = (await req.text()).trim();
  if (!raw) return { parsed: {}, raw: "" };
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return { parsed: parsed as JsonRecord, raw };
    }
  } catch {
    // raw body как JWT или не-JSON — ниже отдельно
  }
  return { parsed: {}, raw };
}

/** Наш OrderId в payment-init — UUID v4; paymentLinkId в вебхуке платёжных ссылок должен совпадать с orderId. */
function looksLikeOurOrderId(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    s.trim(),
  );
}

/** Точка в JWT может класть webhookType/status/paymentLinkId во вложенный `data` и т.п. */
function mergeNestedWebhookBody(parsed: JsonRecord): JsonRecord {
  const blobs: unknown[] = [parsed.data, parsed.body, parsed.payload];
  let merged = { ...parsed };
  for (const b of blobs) {
    if (b && typeof b === "object" && !Array.isArray(b)) {
      merged = { ...merged, ...(b as JsonRecord) };
    }
  }
  return merged;
}

function collectLikelyOrderIds(val: unknown, found: Set<string>, depth: number): void {
  if (depth > 14 || val === undefined) return;
  if (typeof val === "string") {
    const s = val.trim();
    if (looksLikeOurOrderId(s)) found.add(s);
    return;
  }
  if (typeof val !== "object" || val === null) return;
  if (Array.isArray(val)) {
    for (const x of val) collectLikelyOrderIds(x, found, depth + 1);
    return;
  }
  const o = val as Record<string, unknown>;
  for (const [k, v] of Object.entries(o)) {
    const lk = k.toLowerCase().replace(/_/g, "");
    const orderish =
      lk.includes("orderid") ||
      lk.includes("paymentlink") ||
      lk === "order" ||
      lk.includes("externalid") ||
      lk.includes("merchantorder") ||
      lk.includes("clientorder");

    if (typeof v === "string" && orderish && looksLikeOurOrderId(v.trim())) {
      found.add(v.trim());
    }
    collectLikelyOrderIds(v, found, depth + 1);
  }
}

function pickOrderId(parsed: JsonRecord): string {
  const paymentLink =
    typeof parsed.paymentLinkId === "string"
      ? parsed.paymentLinkId.trim()
      : typeof parsed.payment_link_id === "string"
      ? parsed.payment_link_id.trim()
      : "";

  /** В acquiringInternetPayment в paymentLinkId лежит «номер заказа» со ссылки (= наш orderId). */
  if (paymentLink && looksLikeOurOrderId(paymentLink)) return paymentLink;

  const fromFields =
    typeof parsed.orderId === "string"
      ? parsed.orderId.trim()
      : typeof parsed.order_id === "string"
      ? parsed.order_id.trim()
      : typeof parsed.OrderId === "string"
      ? parsed.OrderId.trim()
      : "";
  if (looksLikeOurOrderId(fromFields)) return fromFields;

  const bag = new Set<string>();
  collectLikelyOrderIds(parsed, bag, 0);
  if (bag.size === 1) return [...bag][0]!;
  return "";
}

/** Для платёжных ссылок: только финальное успешное списание или СБП (док.: APPROVED; AUTHORIZED — холд). */
function isAcquiringPaid(claims: JsonRecord): boolean {
  const webhookType = String(claims.webhookType ?? claims.webhook_type ?? "").toLowerCase();
  if (webhookType !== "acquiringinternetpayment") return false;
  const st = String(claims.status ?? "").toUpperCase();
  return st === "APPROVED";
}

function inferMerchantPaymentSuccess(parsed: JsonRecord): boolean {
  if (isAcquiringPaid(parsed)) return true;
  const deep = JSON.stringify(parsed).toLowerCase();
  if (!deep || deep.length < 3) return false;
  const neg = /\b(fail(?:ed)?|reject(?:ed)?|declin|cancel(?:led|ation)?|expire(?:d)?|refund|reversal)\b/;
  if (neg.test(deep)) return false;
  return /\b(paid|succeed(?:ed)?|success(?:ful)?|completed|confirm(?:ed)?|done|settled|approved)\b/.test(
    deep,
  ) || /"success"\s*:\s*true/.test(deep);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
  }

  const expectedSecret = Deno.env.get("TOCHKA_WEBHOOK_SECRET")?.trim() || "";
  const expectedBearer = Deno.env.get("TOCHKA_WEBHOOK_BEARER")?.trim() || "";
  const incomingSecret =
    req.headers.get("x-webhook-secret")?.trim() ||
    req.headers.get("x-tochka-signature")?.trim() ||
    "";
  const incomingBearer = resolveBearer(req);

  const { parsed: legacyParsed, raw } = await readBody(req);

  let parsed: JsonRecord = {};
  let verifiedJwt = false;

  if (looksLikeJwtCompact(raw)) {
    try {
      parsed = mergeNestedWebhookBody(await verifyTochkaWebhookJwt(raw));
      verifiedJwt = true;
    } catch (e) {
      console.warn("[tochka-notification] JWT verify failed", e instanceof Error ? e.message : e);
      /** По политике Точки на тест-хуки нужен ответ 200 иначе вебхук не зарегистрируют; не даём триггерить ретраи. */
      return new Response("OK", {
        status: 200,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }
  } else {
    parsed = legacyParsed;
    /** Устаревший / иной режим без JWT: опционально shared secret или bearer. */
    if (expectedSecret || expectedBearer) {
      if (expectedSecret && incomingSecret !== expectedSecret) {
        return new Response("FORBIDDEN", { status: 403 });
      }
      if (expectedBearer && incomingBearer !== expectedBearer) {
        return new Response("FORBIDDEN", { status: 403 });
      }
    }
  }

  /** По JWT официальных вебхуков Точки полагаемся только на статус платёжа по ссылкам (incomingPayment ≠ наш orderId в реестре). */
  const paidGuess = verifiedJwt
    ? isAcquiringPaid(parsed)
    : inferMerchantPaymentSuccess(parsed);

  const paymentLinkId = pickPaymentLinkIdFromWebhook(parsed);
  let ledgerOrderId = pickOrderId(parsed);
  if (!ledgerOrderId && paymentLinkId && isPracticesCatalogPaymentLink(paymentLinkId)) {
    ledgerOrderId = practicesCatalogOrderId(paymentLinkId);
  }

  const receiptEmailFromWebhook = pickReceiptEmailFromTochkaWebhook(parsed);

  console.log("[tochka-notification]", {
    verifiedJwt,
    webhookType: parsed.webhookType,
    status: parsed.status,
    paymentLinkId: parsed.paymentLinkId ?? paymentLinkId,
    ledgerOrderId,
    receiptEmail: receiptEmailFromWebhook ? "(present)" : "(missing)",
    paidGuess,
    rawPreview: raw.slice(0, 120),
  });

  if (ledgerOrderId && paidGuess) {
    try {
      const sb = createServiceSupabase();
      const isCatalogOrder = ledgerOrderId.startsWith("tochka-catalog-");

      if (isCatalogOrder) {
        const email = receiptEmailFromWebhook ?? fakeCheckoutEmail(ledgerOrderId);
        const { created, emailUpdated } = await upsertPracticesPaidOrder(sb, ledgerOrderId, email);
        if (created || emailUpdated) {
          await sendPracticesPurchaseTelegram(ledgerOrderId, email);
          try {
            await recordPracticesPaidCrm(sb, ledgerOrderId);
          } catch (crmE) {
            console.error("[tochka-notification] CRM record failed", crmE);
          }
        }
      } else {
        const email = receiptEmailFromWebhook ?? fakeCheckoutEmail(ledgerOrderId);
        const firstPaid = await practicesMarkPaid(sb, ledgerOrderId);
        if (firstPaid) {
          const receiptEmail = (await practicesGetReceiptEmail(sb, ledgerOrderId)) ?? email;
          await sendPracticesPurchaseTelegram(ledgerOrderId, receiptEmail);
          try {
            await recordPracticesPaidCrm(sb, ledgerOrderId);
          } catch (crmE) {
            console.error("[tochka-notification] CRM record failed", crmE);
          }
        } else {
          const { created, emailUpdated } = await upsertPracticesPaidOrder(sb, ledgerOrderId, email);
          if (created || emailUpdated) {
            await sendPracticesPurchaseTelegram(ledgerOrderId, email);
            try {
              await recordPracticesPaidCrm(sb, ledgerOrderId);
            } catch (crmE) {
              console.error("[tochka-notification] CRM catalog-fallback CRM failed", crmE);
            }
          }
        }
      }
    } catch (e) {
      console.error("[tochka-notification] ledger error", e);
    }
  }

  return new Response("OK", {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
});
