import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { PaymentProvider } from "./practicesTypes.ts";

export async function practicesInsertInitiated(
  sb: SupabaseClient,
  row: {
    order_id: string;
    provider: PaymentProvider;
    receipt_email: string;
    amount_kopecks: number;
  },
): Promise<void> {
  const { error } = await sb.from("practices_payment_orders").insert({
    order_id: row.order_id,
    provider: row.provider,
    receipt_email: row.receipt_email,
    amount_kopecks: row.amount_kopecks,
    status: "initiated",
  });
  if (error) throw error;
}

/** true если заказ впервые перешёл в paid (можно отправить Telegram). */
export async function practicesMarkPaid(sb: SupabaseClient, orderId: string): Promise<boolean> {
  const { data, error } = await sb
    .from("practices_payment_orders")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
    })
    .eq("order_id", orderId)
    .eq("status", "initiated")
    .select("order_id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

export async function practicesIsPaid(sb: SupabaseClient, orderId: string): Promise<boolean> {
  const { data, error } = await sb
    .from("practices_payment_orders")
    .select("order_id")
    .eq("order_id", orderId)
    .eq("status", "paid")
    .maybeSingle();
  if (error) throw error;
  return Boolean(data?.order_id);
}

export async function practicesGetReceiptEmail(sb: SupabaseClient, orderId: string): Promise<string | null> {
  const { data, error } = await sb
    .from("practices_payment_orders")
    .select("receipt_email")
    .eq("order_id", orderId)
    .maybeSingle();
  if (error || !data?.receipt_email) return null;
  const s = typeof data.receipt_email === "string" ? data.receipt_email.trim() : "";
  return s ? s : null;
}

export async function practicesGetChannelInviteLink(
  sb: SupabaseClient,
  orderId: string,
): Promise<string | null> {
  const { data, error } = await sb
    .from("practices_payment_orders")
    .select("channel_invite_link")
    .eq("order_id", orderId)
    .maybeSingle();
  if (error || !data?.channel_invite_link) return null;
  const s = typeof data.channel_invite_link === "string" ? data.channel_invite_link.trim() : "";
  return s ? s : null;
}

export async function practicesSaveChannelInviteLink(
  sb: SupabaseClient,
  orderId: string,
  inviteLink: string,
): Promise<void> {
  const { error } = await sb
    .from("practices_payment_orders")
    .update({
      channel_invite_link: inviteLink,
      channel_invite_created_at: new Date().toISOString(),
    })
    .eq("order_id", orderId);
  if (error) throw error;
}
