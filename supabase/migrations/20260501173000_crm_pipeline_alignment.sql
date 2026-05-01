begin;

-- sort_order глобально unique: при новой шкале возможны столкновения со старыми строками (например qualified=20 vs diagnostic_requested=20).
-- Временно сдвигаем порядок, затем upsert выставляет целевые значения.
update public.crm_pipeline_stages
set sort_order = sort_order + 1000000
where sort_order < 1000000;

-- 1) Актуализируем этапы воронки под текущий процесс.
insert into public.crm_pipeline_stages (code, name, sort_order, is_final, is_success, is_active)
values
  ('new_lead', 'Новый лид (ручной)', 10, false, false, true),
  ('diagnostic_requested', 'Запрос на диагностику', 20, false, false, true),
  ('quiz_completed', 'Запрос на разбор', 30, false, false, true),
  ('gift_received', 'Получил подарок', 40, false, false, true),
  ('bot_started', 'Запустил бота', 50, false, false, true),
  ('qualified', 'Квалифицирован', 60, false, false, true),
  ('contacted', 'Связались', 70, false, false, true),
  ('offer_sent', 'Оффер отправлен', 80, false, false, true),
  ('payment_pending', 'Ожидание оплаты', 90, false, false, true),
  ('won', 'Успешная оплата', 100, false, true, true),
  ('next_service_potential', 'Потенциал на следующую услугу', 110, false, true, true),
  ('lost', 'Потерян', 999, true, false, true)
on conflict (code) do update
set
  name = excluded.name,
  sort_order = excluded.sort_order,
  is_final = excluded.is_final,
  is_success = excluded.is_success,
  is_active = excluded.is_active,
  updated_at = timezone('utc', now());

-- 2) Назначаем стартовый этап по источнику, чтобы "Новый лид" оставался ручным.
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
  v_source_detail text := lower(coalesce(nullif(trim(p_source_detail), ''), ''));
  v_new_stage_code text := 'new_lead';
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
    -- Авто-лиды не должны стартовать как "Новый лид (ручной)".
    if v_source_channel = 'telegram_bot' then
      v_new_stage_code := 'bot_started';
    elsif v_source_channel in ('site_form', 'site_quiz', 'site') then
      if v_source_detail in ('gift_received', 'gift_claimed') then
        v_new_stage_code := 'gift_received';
      elsif v_source_detail in ('quiz_completed', 'quiz_request_submitted', 'breakdown_requested') then
        v_new_stage_code := 'quiz_completed';
      elsif v_source_detail in ('bot_started', 'telegram_bot_started') then
        v_new_stage_code := 'bot_started';
      else
        v_new_stage_code := 'diagnostic_requested';
      end if;
    end if;

    select id
      into v_new_stage_id
    from public.crm_pipeline_stages
    where code = v_new_stage_code
      and is_active = true
    limit 1;

    if v_new_stage_id is null then
      select id
        into v_new_stage_id
      from public.crm_pipeline_stages
      where code = 'new_lead'
      limit 1;
    end if;

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
        'Автоматически присвоен стартовый этап по источнику'
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
