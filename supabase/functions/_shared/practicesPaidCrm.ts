import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { getPracticesAmountKopecks } from "./practicesPricing.ts";

/** Фиксируем в CRM успешную оплату сборника по email из чека (webhook эквайера). */
export async function recordPracticesPaidCrm(sb: SupabaseClient, orderId: string): Promise<void> {
  const { data: row, error: rowErr } = await sb
    .from("practices_payment_orders")
    .select("receipt_email")
    .eq("order_id", orderId)
    .maybeSingle();
  if (rowErr || !row?.receipt_email?.trim()) {
    console.warn("[practices crm] no receipt_email for order", orderId, rowErr?.message);
    return;
  }

  const email = row.receipt_email.trim().toLowerCase();

  const { data: contact, error: upsertErr } = await sb.rpc("crm_upsert_contact", {
    p_full_name: null,
    p_phone: null,
    p_email: email,
    p_telegram_id: null,
    p_telegram_username: null,
    p_source_channel: "site",
    p_source_detail: "practices_debt_freedom",
    p_utm_source: null,
    p_utm_medium: null,
    p_utm_campaign: null,
    p_utm_content: null,
    p_utm_term: null,
    p_segment: null,
    p_owner_user_id: null,
    p_consent_personal_data: false,
    p_comment: "Оплата сборника «Свобода от долгов» (данные эквайера)",
  });

  const contactRow = contact as unknown as { id?: string } | null;
  if (upsertErr || !contactRow?.id) {
    console.error("[practices crm] upsert_contact failed", orderId, upsertErr?.message);
    return;
  }

  const contactId = contactRow.id;

  await sb.rpc("crm_add_interaction", {
    p_contact_id: contactId,
    p_channel: "payment",
    p_direction: "inbound",
    p_interaction_type: "practices_collection_paid",
    p_payload: {
      orderId,
      product: "practices_svoboda_ot_dolgov",
      amountKopecks: getPracticesAmountKopecks(),
      currency: "RUB",
    },
  });

  const { error: stageErr } = await sb.rpc("crm_change_stage", {
    p_contact_id: contactId,
    p_to_stage_code: "paid",
    p_changed_by: "system",
    p_reason: "payment_webhook",
    p_note: "Оплачен цифровой сборник практик",
  });
  if (stageErr) {
    console.warn("[practices crm] change_stage skipped", stageErr.message);
  }
}

/** После выдачи invite-ссылки на канал (сайт, без бота). */
export async function recordPracticesChannelInviteCrm(
  sb: SupabaseClient,
  orderId: string,
): Promise<void> {
  const { data: row, error: rowErr } = await sb
    .from("practices_payment_orders")
    .select("receipt_email")
    .eq("order_id", orderId)
    .maybeSingle();
  if (rowErr || !row?.receipt_email?.trim()) {
    console.warn("[practices crm] channel invite: no receipt_email", orderId, rowErr?.message);
    return;
  }

  const email = row.receipt_email.trim().toLowerCase();

  const { data: contact, error: upsertErr } = await sb.rpc("crm_upsert_contact", {
    p_full_name: null,
    p_phone: null,
    p_email: email,
    p_telegram_id: null,
    p_telegram_username: null,
    p_source_channel: "site",
    p_source_detail: "practices_debt_freedom",
    p_utm_source: null,
    p_utm_medium: null,
    p_utm_campaign: null,
    p_utm_content: null,
    p_utm_term: null,
    p_segment: null,
    p_owner_user_id: null,
    p_consent_personal_data: false,
    p_comment: "Выдача доступа в канал сборника «Свобода от долгов»",
  });

  const contactRow = contact as unknown as { id?: string } | null;
  if (upsertErr || !contactRow?.id) {
    console.error("[practices crm] channel invite upsert failed", orderId, upsertErr?.message);
    return;
  }

  const contactId = contactRow.id;

  await sb.rpc("crm_add_interaction", {
    p_contact_id: contactId,
    p_channel: "site",
    p_direction: "outbound",
    p_interaction_type: "practices_collection_channel_invite",
    p_payload: {
      orderId,
      product: "practices_svoboda_ot_dolgov",
    },
  });
}
