-- =============================================================================
-- CRM: новая воронка (этапы v2) — один запуск в Supabase SQL Editor.
-- Выполнять ОДИН раз. Если уже применяли миграцию 20260504100000 — не повторять.
-- Ошибка duplicate key на sort_order: сначала
--   scripts/crm/05_repair_pipeline_sort_order_conflicts.sql
-- =============================================================================

begin;

update public.crm_pipeline_stages
set sort_order = sort_order + 10000000
where sort_order < 10000000;

insert into public.crm_pipeline_stages (code, name, sort_order, is_final, is_success, is_active)
values
  ('interest_confirmed', 'Интерес подтверждён (согласен на диагностику / разбор)', 40, false, false, true)
on conflict (code) do update
set
  name = excluded.name,
  is_final = excluded.is_final,
  is_success = excluded.is_success,
  is_active = excluded.is_active,
  updated_at = timezone('utc', now());

update public.crm_contacts c
set current_stage_id = ic.id
from public.crm_pipeline_stages ic
where ic.code = 'interest_confirmed'
  and c.current_stage_id in (
    select ps.id
    from public.crm_pipeline_stages ps
    where ps.code in ('diagnostic_requested', 'quiz_completed')
  );

update public.crm_contacts c
set current_stage_id = nl.id
from public.crm_pipeline_stages nl
where nl.code = 'new_lead'
  and c.current_stage_id in (
    select ps.id
    from public.crm_pipeline_stages ps
    where ps.code in ('gift_received', 'bot_started')
  );

update public.crm_pipeline_stages
set
  is_active = false,
  updated_at = timezone('utc', now())
where code in ('diagnostic_requested', 'quiz_completed', 'gift_received', 'bot_started');

update public.crm_pipeline_stages
set
  code = 'contact_established',
  name = 'Контакт установлен (контакт проверен — дозвонились / ответил / в боте)',
  updated_at = timezone('utc', now())
where code = 'contacted';

update public.crm_pipeline_stages
set
  code = 'offer_made',
  name = 'Оффер сделан',
  updated_at = timezone('utc', now())
where code = 'offer_sent';

update public.crm_pipeline_stages
set
  code = 'in_negotiations',
  name = 'В переговорах (думает / обсуждает / возражения)',
  updated_at = timezone('utc', now())
where code = 'payment_pending';

update public.crm_pipeline_stages
set
  code = 'paid',
  name = 'Оплачено',
  is_final = false,
  is_success = true,
  updated_at = timezone('utc', now())
where code = 'won';

update public.crm_pipeline_stages
set
  code = 'post_sale',
  name = 'Постпродажный этап',
  is_final = false,
  is_success = true,
  updated_at = timezone('utc', now())
where code = 'next_service_potential';

update public.crm_pipeline_stages
set name = 'Новый лид (завели в CRM или сам зарегистрировался в боте)', updated_at = timezone('utc', now())
where code = 'new_lead';

update public.crm_pipeline_stages
set name = 'Квалифицирован (поняли, что это целевой клиент)', updated_at = timezone('utc', now())
where code = 'qualified';

update public.crm_pipeline_stages
set name = 'Потерян', updated_at = timezone('utc', now())
where code = 'lost';

update public.crm_pipeline_stages
set sort_order = v.so, updated_at = timezone('utc', now())
from (values
  ('new_lead', 10),
  ('contact_established', 20),
  ('qualified', 30),
  ('interest_confirmed', 40),
  ('offer_made', 50),
  ('in_negotiations', 60),
  ('paid', 70),
  ('post_sale', 80),
  ('lost', 999)
) as v(code, so)
where public.crm_pipeline_stages.code = v.code;

create or replace function public.crm_upsert_contact(
  p_full_name text default null,
  p_phone text default null,
  p_email text default null,
  p_telegram_id bigint default null,
  p_source_channel text default 'unknown',
  p_source_detail text default null,
  p_utm_source text default null,
  p_utm_medium text default null,
  p_utm_campaign text default null,
  p_utm_content text default null,
  p_utm_term text default null,
  p_segment text default null,
  p_owner_user_id uuid default null,
  p_consent_personal_data boolean default false,
  p_comment text default null
)
returns public.crm_contacts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text := public.crm_normalize_phone(p_phone);
  v_contact public.crm_contacts;
  v_new_stage_id uuid;
  v_source_channel text := coalesce(nullif(trim(p_source_channel), ''), 'unknown');
begin
  select *
    into v_contact
  from public.crm_contacts c
  where (v_phone is not null and c.phone = v_phone)
     or (p_email is not null and p_email <> '' and c.email = lower(trim(p_email)))
     or (p_telegram_id is not null and c.telegram_id = p_telegram_id)
  order by c.created_at asc
  limit 1;

  if not found then
    select id
      into v_new_stage_id
    from public.crm_pipeline_stages
    where code = 'new_lead'
      and is_active = true
    limit 1;

    insert into public.crm_contacts (
      full_name,
      phone,
      email,
      telegram_id,
      source_channel,
      source_detail,
      utm_source,
      utm_medium,
      utm_campaign,
      utm_content,
      utm_term,
      current_stage_id,
      segment,
      owner_user_id,
      consent_personal_data,
      comment,
      last_activity_at
    )
    values (
      nullif(trim(p_full_name), ''),
      v_phone,
      nullif(lower(trim(p_email)), ''),
      p_telegram_id,
      v_source_channel,
      nullif(trim(p_source_detail), ''),
      nullif(trim(p_utm_source), ''),
      nullif(trim(p_utm_medium), ''),
      nullif(trim(p_utm_campaign), ''),
      nullif(trim(p_utm_content), ''),
      nullif(trim(p_utm_term), ''),
      v_new_stage_id,
      nullif(trim(p_segment), ''),
      p_owner_user_id,
      coalesce(p_consent_personal_data, false),
      nullif(trim(p_comment), ''),
      timezone('utc', now())
    )
    returning * into v_contact;

    if v_contact.current_stage_id is not null then
      insert into public.crm_contact_stage_history (
        contact_id,
        from_stage_id,
        to_stage_id,
        changed_by,
        reason,
        note
      )
      values (
        v_contact.id,
        null,
        v_contact.current_stage_id,
        'system',
        'lead_created',
        'Стартовый этап при создании лида'
      );
    end if;
  else
    update public.crm_contacts c
    set
      full_name = coalesce(nullif(trim(p_full_name), ''), c.full_name),
      phone = coalesce(v_phone, c.phone),
      email = coalesce(nullif(lower(trim(p_email)), ''), c.email),
      telegram_id = coalesce(p_telegram_id, c.telegram_id),
      source_channel = coalesce(nullif(trim(p_source_channel), ''), c.source_channel),
      source_detail = coalesce(nullif(trim(p_source_detail), ''), c.source_detail),
      utm_source = coalesce(nullif(trim(p_utm_source), ''), c.utm_source),
      utm_medium = coalesce(nullif(trim(p_utm_medium), ''), c.utm_medium),
      utm_campaign = coalesce(nullif(trim(p_utm_campaign), ''), c.utm_campaign),
      utm_content = coalesce(nullif(trim(p_utm_content), ''), c.utm_content),
      utm_term = coalesce(nullif(trim(p_utm_term), ''), c.utm_term),
      segment = coalesce(nullif(trim(p_segment), ''), c.segment),
      owner_user_id = coalesce(p_owner_user_id, c.owner_user_id),
      consent_personal_data = c.consent_personal_data or coalesce(p_consent_personal_data, false),
      comment = coalesce(c.comment, nullif(trim(p_comment), '')),
      last_activity_at = timezone('utc', now())
    where c.id = v_contact.id
    returning * into v_contact;
  end if;

  return v_contact;
end;
$$;

revoke all on function public.crm_upsert_contact(text, text, text, bigint, text, text, text, text, text, text, text, text, uuid, boolean, text) from public;
grant execute on function public.crm_upsert_contact(text, text, text, bigint, text, text, text, text, text, text, text, text, uuid, boolean, text) to anon, authenticated, service_role;

commit;
