begin;

create or replace function public.crm_normalize_phone(raw_phone text)
returns text
language sql
immutable
as $$
  select nullif(regexp_replace(coalesce(raw_phone, ''), '[^0-9+]', '', 'g'), '');
$$;

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
    select id into v_new_stage_id
    from public.crm_pipeline_stages
    where code = 'new_lead'
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
      coalesce(nullif(trim(p_source_channel), ''), 'unknown'),
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
        'Автоматически присвоен стартовый этап'
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

create or replace function public.crm_change_stage(
  p_contact_id uuid,
  p_to_stage_code text,
  p_changed_by text default 'manager',
  p_reason text default 'manual',
  p_note text default null
)
returns public.crm_contacts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contact public.crm_contacts;
  v_to_stage_id uuid;
  v_from_stage_id uuid;
begin
  select * into v_contact
  from public.crm_contacts
  where id = p_contact_id
  for update;

  if not found then
    raise exception 'crm_change_stage: contact not found';
  end if;

  select id into v_to_stage_id
  from public.crm_pipeline_stages
  where code = p_to_stage_code and is_active = true
  limit 1;

  if v_to_stage_id is null then
    raise exception 'crm_change_stage: stage code % not found', p_to_stage_code;
  end if;

  v_from_stage_id := v_contact.current_stage_id;
  if v_from_stage_id = v_to_stage_id then
    return v_contact;
  end if;

  update public.crm_contacts c
  set current_stage_id = v_to_stage_id,
      last_activity_at = timezone('utc', now())
  where c.id = p_contact_id
  returning * into v_contact;

  insert into public.crm_contact_stage_history (
    contact_id,
    from_stage_id,
    to_stage_id,
    changed_by,
    reason,
    note
  )
  values (
    p_contact_id,
    v_from_stage_id,
    v_to_stage_id,
    case when p_changed_by in ('system', 'manager', 'bot') then p_changed_by else 'manager' end,
    coalesce(nullif(trim(p_reason), ''), 'manual'),
    nullif(trim(p_note), '')
  );

  return v_contact;
end;
$$;

revoke all on function public.crm_change_stage(uuid, text, text, text, text) from public;
grant execute on function public.crm_change_stage(uuid, text, text, text, text) to authenticated, service_role;

create or replace function public.crm_add_interaction(
  p_contact_id uuid,
  p_channel text,
  p_direction text,
  p_interaction_type text,
  p_payload jsonb default '{}'::jsonb
)
returns public.crm_interactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_interaction public.crm_interactions;
  v_dir text;
begin
  v_dir := case
    when p_direction in ('inbound', 'outbound', 'internal') then p_direction
    else 'internal'
  end;

  insert into public.crm_interactions (
    contact_id,
    channel,
    direction,
    interaction_type,
    payload
  )
  values (
    p_contact_id,
    coalesce(nullif(trim(p_channel), ''), 'unknown'),
    v_dir,
    coalesce(nullif(trim(p_interaction_type), ''), 'note'),
    coalesce(p_payload, '{}'::jsonb)
  )
  returning * into v_interaction;

  update public.crm_contacts
  set last_activity_at = timezone('utc', now())
  where id = p_contact_id;

  return v_interaction;
end;
$$;

revoke all on function public.crm_add_interaction(uuid, text, text, text, jsonb) from public;
grant execute on function public.crm_add_interaction(uuid, text, text, text, jsonb) to authenticated, service_role;

commit;
