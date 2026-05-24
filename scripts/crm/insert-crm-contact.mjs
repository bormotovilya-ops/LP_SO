#!/usr/bin/env node
/**
 * Прямая вставка строки в public.crm_contacts (+ история этапа, опционально crm_interactions).
 * Нужны права сервис-роли (обход RLS).
 *
 * PowerShell:
 *   $env:SUPABASE_URL = "https://<ref>.supabase.co"
 *   $env:SUPABASE_SERVICE_ROLE_KEY = "<service_role_secret>"
 *   node .\scripts\crm\insert-crm-contact.mjs .\scripts\crm\examples\crm-contact-insert.payload.json
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !key) {
  console.error("Задайте SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const fileArg = process.argv[2];
if (!fileArg) {
  console.error("Usage: node insert-crm-contact.mjs <payload.json>");
  process.exit(1);
}

const abs = path.resolve(process.cwd(), fileArg);
let payload;
try {
  payload = JSON.parse(await readFile(abs, "utf8"));
} catch {
  console.error("Некорректный JSON:", abs);
  process.exit(1);
}

/** Поля строки crm_contacts (без вычисляемого этапа). */
const CONTACT_ROW_KEYS = new Set([
  "id",
  "created_at",
  "updated_at",
  "full_name",
  "phone",
  "email",
  "telegram_id",
  "telegram_username",
  "whatsapp_id",
  "vk_id",
  "source_channel",
  "source_detail",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "current_stage_id",
  "lead_temperature",
  "segment",
  "owner_user_id",
  "is_duplicate",
  "consent_personal_data",
  "last_activity_at",
  "next_action_at",
  "comment",
  "gift_received",
]);

function pickContactRow(raw) {
  const row = {};
  if (!raw || typeof raw !== "object") return row;
  for (const [k, v] of Object.entries(raw)) {
    if (CONTACT_ROW_KEYS.has(k) && v !== undefined) row[k] = v;
  }
  if (row.email != null && typeof row.email === "string") {
    row.email = row.email.trim().toLowerCase() || null;
  }
  if (Object.prototype.hasOwnProperty.call(row, "email") && row.email === "") {
    row.email = null;
  }
  return row;
}

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const contactIn = pickContactRow(payload.contact);
const stageCode = typeof payload.stage_code === "string" && payload.stage_code.trim()
  ? payload.stage_code.trim()
  : "new_lead";

let currentStageId = contactIn.current_stage_id ?? null;
if (!currentStageId) {
  const { data: stageRow, error: stageErr } = await supabase
    .from("crm_pipeline_stages")
    .select("id")
    .eq("code", stageCode)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (stageErr) {
    console.error("Ошибка чтения этапа:", stageErr.message);
    process.exit(1);
  }
  if (!stageRow?.id) {
    console.error(`Этап с code=${stageCode} не найден или неактивен.`);
    process.exit(1);
  }
  currentStageId = stageRow.id;
}

const nowIso = new Date().toISOString();
function omitUndefined(o) {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
}

const row = omitUndefined({
  ...contactIn,
  current_stage_id: currentStageId,
  source_channel: contactIn.source_channel ?? "other",
  lead_temperature: contactIn.lead_temperature ?? "cold",
  consent_personal_data: contactIn.consent_personal_data ?? true,
  last_activity_at: contactIn.last_activity_at ?? nowIso,
});

const { data: inserted, error: insErr } = await supabase.from("crm_contacts").insert(row).select("id").single();

if (insErr) {
  console.error("insert crm_contacts:", insErr.message);
  process.exit(1);
}

const contactId = inserted.id;
console.log("crm_contacts.id:", contactId);

const { error: histErr } = await supabase.from("crm_contact_stage_history").insert({
  contact_id: contactId,
  from_stage_id: null,
  to_stage_id: currentStageId,
  changed_by: "system",
  reason: payload.stage_history_reason ?? "manual_insert",
  note: payload.stage_history_note ?? "Скрипт insert-crm-contact.mjs",
});

if (histErr) {
  console.error("insert crm_contact_stage_history:", histErr.message);
  process.exit(1);
}

const interactions = Array.isArray(payload.interactions) ? payload.interactions : [];
for (const it of interactions) {
  if (!it || typeof it !== "object") continue;
  const channel = String(it.channel ?? "quiz_form");
  const direction = String(it.direction ?? "inbound");
  const interaction_type = String(it.interaction_type ?? it.type ?? "lead_capture");
  const pay = it.payload && typeof it.payload === "object" ? it.payload : {};

  const { error: intErr } = await supabase.from("crm_interactions").insert({
    contact_id: contactId,
    channel,
    direction,
    interaction_type,
    payload: pay,
  });

  if (intErr) {
    console.error("insert crm_interactions:", intErr.message);
    process.exit(1);
  }
}

console.log("OK: контакт и история этапа созданы.", interactions.length ? `Интеракций: ${interactions.length}.` : "");
