begin;

with manager_profile as (
  select id from public.crm_profiles where role in ('admin', 'manager') order by created_at asc limit 1
),
contact_one as (
  select (public.crm_upsert_contact(
    p_full_name := 'Тестовый клиент 1',
    p_phone := '+7 (999) 111-22-33',
    p_email := 'lead1@example.com',
    p_source_channel := 'site_quiz',
    p_source_detail := 'quiz_landing',
    p_utm_source := 'instagram',
    p_utm_medium := 'cpc',
    p_utm_campaign := 'april_launch',
    p_segment := 'diagnostic',
    p_owner_user_id := (select id from manager_profile),
    p_comment := 'Создан демонстрационным сидом'
  )).*
),
contact_two as (
  select (public.crm_upsert_contact(
    p_full_name := 'Тестовый клиент 2',
    p_phone := '+7 (999) 444-55-66',
    p_source_channel := 'telegram_bot',
    p_source_detail := 'start_payload',
    p_segment := 'present',
    p_owner_user_id := (select id from manager_profile),
    p_comment := 'Лид из бота'
  )).*
)
select 1;

insert into public.crm_tasks (contact_id, title, description, status, priority, due_at, assignee_user_id)
select
  c.id,
  'Первичный контакт',
  'Связаться и уточнить запрос клиента',
  'open',
  'high',
  timezone('utc', now()) + interval '4 hours',
  c.owner_user_id
from public.crm_contacts c
where c.email = 'lead1@example.com'
on conflict do nothing;

do $$
declare
  v_contact_id uuid;
begin
  select id into v_contact_id from public.crm_contacts where phone = '+79994445566' limit 1;
  if v_contact_id is not null then
    perform public.crm_add_interaction(
      p_contact_id := v_contact_id,
      p_channel := 'telegram',
      p_direction := 'inbound',
      p_interaction_type := 'bot_message',
      p_payload := '{"text":"Хочу консультацию","intent":"diagnostic"}'::jsonb
    );
    perform public.crm_change_stage(
      p_contact_id := v_contact_id,
      p_to_stage_code := 'qualified',
      p_changed_by := 'bot',
      p_reason := 'bot_rule',
      p_note := 'Пользователь дошел до квалифицирующего шага'
    );
  end if;
end $$;

commit;
