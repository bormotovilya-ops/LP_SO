-- =============================================================================
-- LP_SO CRM: consolidated migrations for manual run in Supabase SQL Editor.
--
-- If ERROR: duplicate ... crm_pipeline_stages_sort_order_key:
--   1) Run scripts/crm/05_repair_pipeline_sort_order_conflicts.sql
--   2) Re-run only the failed migration or the INSERT part of 20260501173000
-- =============================================================================




-- >>> FILE: supabase/migrations/20260426010000_mini_crm_core.sql <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

begin;

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.crm_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'manager' check (role in ('admin', 'manager', 'viewer')),
  display_name text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.crm_pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  sort_order integer not null unique,
  is_final boolean not null default false,
  is_success boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.crm_contacts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  full_name text,
  phone text,
  email text,
  telegram_id bigint,
  whatsapp_id text,
  vk_id text,
  source_channel text not null default 'unknown',
  source_detail text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  current_stage_id uuid references public.crm_pipeline_stages(id),
  lead_temperature text not null default 'cold' check (lead_temperature in ('cold', 'warm', 'hot')),
  segment text,
  owner_user_id uuid references auth.users(id),
  is_duplicate boolean not null default false,
  consent_personal_data boolean not null default false,
  last_activity_at timestamptz,
  next_action_at timestamptz,
  comment text
);

create unique index if not exists crm_contacts_phone_uq on public.crm_contacts(phone) where phone is not null and phone <> '';
create unique index if not exists crm_contacts_email_uq on public.crm_contacts(email) where email is not null and email <> '';
create unique index if not exists crm_contacts_telegram_uq on public.crm_contacts(telegram_id) where telegram_id is not null;
create index if not exists crm_contacts_stage_idx on public.crm_contacts(current_stage_id);
create index if not exists crm_contacts_owner_idx on public.crm_contacts(owner_user_id);
create index if not exists crm_contacts_created_idx on public.crm_contacts(created_at desc);
create index if not exists crm_contacts_activity_idx on public.crm_contacts(last_activity_at desc);

create table if not exists public.crm_contact_stage_history (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.crm_contacts(id) on delete cascade,
  from_stage_id uuid references public.crm_pipeline_stages(id),
  to_stage_id uuid not null references public.crm_pipeline_stages(id),
  changed_by text not null default 'system' check (changed_by in ('system', 'manager', 'bot')),
  reason text not null default 'manual',
  note text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists crm_contact_stage_history_contact_idx on public.crm_contact_stage_history(contact_id, created_at desc);

create table if not exists public.crm_interactions (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.crm_contacts(id) on delete cascade,
  channel text not null,
  direction text not null check (direction in ('inbound', 'outbound', 'internal')),
  interaction_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  created_by uuid references auth.users(id)
);

create index if not exists crm_interactions_contact_idx on public.crm_interactions(contact_id, created_at desc);
create index if not exists crm_interactions_channel_idx on public.crm_interactions(channel);

create table if not exists public.crm_tasks (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.crm_contacts(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'open' check (status in ('open', 'in_progress', 'done', 'cancelled')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  due_at timestamptz,
  assignee_user_id uuid references auth.users(id),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists crm_tasks_assignee_idx on public.crm_tasks(assignee_user_id, status);
create index if not exists crm_tasks_due_idx on public.crm_tasks(due_at) where status in ('open', 'in_progress');

create table if not exists public.crm_products (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  product_type text not null check (product_type in ('consultation', 'mini_course', 'full_course', 'other')),
  price numeric(12, 2) not null check (price >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.crm_orders (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.crm_contacts(id) on delete restrict,
  product_id uuid references public.crm_products(id),
  external_order_id text unique,
  status text not null default 'draft' check (status in ('draft', 'invoice_sent', 'paid', 'cancelled', 'refund')),
  amount numeric(12, 2) not null check (amount >= 0),
  payment_provider text,
  payment_reference text,
  created_at timestamptz not null default timezone('utc', now()),
  paid_at timestamptz
);

create index if not exists crm_orders_contact_idx on public.crm_orders(contact_id, created_at desc);
create index if not exists crm_orders_status_idx on public.crm_orders(status);

create table if not exists public.crm_bot_sessions (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.crm_contacts(id) on delete cascade,
  bot_platform text not null default 'telegram',
  session_state jsonb not null default '{}'::jsonb,
  last_intent text,
  last_message_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (contact_id, bot_platform)
);

create table if not exists public.crm_outbox_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  retry_count integer not null default 0,
  next_retry_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  sent_at timestamptz
);

create index if not exists crm_outbox_status_idx on public.crm_outbox_events(status, created_at);

drop trigger if exists trg_crm_profiles_updated_at on public.crm_profiles;
create trigger trg_crm_profiles_updated_at before update on public.crm_profiles for each row execute function public.set_updated_at();
drop trigger if exists trg_crm_pipeline_stages_updated_at on public.crm_pipeline_stages;
create trigger trg_crm_pipeline_stages_updated_at before update on public.crm_pipeline_stages for each row execute function public.set_updated_at();
drop trigger if exists trg_crm_contacts_updated_at on public.crm_contacts;
create trigger trg_crm_contacts_updated_at before update on public.crm_contacts for each row execute function public.set_updated_at();
drop trigger if exists trg_crm_tasks_updated_at on public.crm_tasks;
create trigger trg_crm_tasks_updated_at before update on public.crm_tasks for each row execute function public.set_updated_at();
drop trigger if exists trg_crm_products_updated_at on public.crm_products;
create trigger trg_crm_products_updated_at before update on public.crm_products for each row execute function public.set_updated_at();
drop trigger if exists trg_crm_bot_sessions_updated_at on public.crm_bot_sessions;
create trigger trg_crm_bot_sessions_updated_at before update on public.crm_bot_sessions for each row execute function public.set_updated_at();

create or replace function public.crm_is_admin(user_id uuid)
returns boolean
language sql
stable
as $$
  select exists(
    select 1
    from public.crm_profiles p
    where p.id = user_id
      and p.is_active = true
      and p.role = 'admin'
  );
$$;

alter table public.crm_profiles enable row level security;
alter table public.crm_pipeline_stages enable row level security;
alter table public.crm_contacts enable row level security;
alter table public.crm_contact_stage_history enable row level security;
alter table public.crm_interactions enable row level security;
alter table public.crm_tasks enable row level security;
alter table public.crm_products enable row level security;
alter table public.crm_orders enable row level security;
alter table public.crm_bot_sessions enable row level security;
alter table public.crm_outbox_events enable row level security;

drop policy if exists crm_profiles_select on public.crm_profiles;
create policy crm_profiles_select on public.crm_profiles
for select using (auth.uid() = id or public.crm_is_admin(auth.uid()));

drop policy if exists crm_profiles_admin_manage on public.crm_profiles;
create policy crm_profiles_admin_manage on public.crm_profiles
for all using (public.crm_is_admin(auth.uid()))
with check (public.crm_is_admin(auth.uid()));

drop policy if exists crm_pipeline_stages_read_all on public.crm_pipeline_stages;
create policy crm_pipeline_stages_read_all on public.crm_pipeline_stages
for select using (auth.uid() is not null);

drop policy if exists crm_pipeline_stages_admin_write on public.crm_pipeline_stages;
create policy crm_pipeline_stages_admin_write on public.crm_pipeline_stages
for all using (public.crm_is_admin(auth.uid()))
with check (public.crm_is_admin(auth.uid()));

drop policy if exists crm_contacts_select_policy on public.crm_contacts;
create policy crm_contacts_select_policy on public.crm_contacts
for select using (
  public.crm_is_admin(auth.uid())
  or owner_user_id = auth.uid()
);

drop policy if exists crm_contacts_insert_policy on public.crm_contacts;
create policy crm_contacts_insert_policy on public.crm_contacts
for insert with check (
  public.crm_is_admin(auth.uid())
  or owner_user_id = auth.uid()
  or owner_user_id is null
);

drop policy if exists crm_contacts_update_policy on public.crm_contacts;
create policy crm_contacts_update_policy on public.crm_contacts
for update using (
  public.crm_is_admin(auth.uid())
  or owner_user_id = auth.uid()
)
with check (
  public.crm_is_admin(auth.uid())
  or owner_user_id = auth.uid()
);

drop policy if exists crm_contact_stage_history_policy on public.crm_contact_stage_history;
create policy crm_contact_stage_history_policy on public.crm_contact_stage_history
for all using (
  exists (
    select 1
    from public.crm_contacts c
    where c.id = contact_id
      and (
        public.crm_is_admin(auth.uid())
        or c.owner_user_id = auth.uid()
      )
  )
)
with check (
  exists (
    select 1
    from public.crm_contacts c
    where c.id = contact_id
      and (
        public.crm_is_admin(auth.uid())
        or c.owner_user_id = auth.uid()
      )
  )
);

drop policy if exists crm_interactions_policy on public.crm_interactions;
create policy crm_interactions_policy on public.crm_interactions
for all using (
  exists (
    select 1
    from public.crm_contacts c
    where c.id = contact_id
      and (
        public.crm_is_admin(auth.uid())
        or c.owner_user_id = auth.uid()
      )
  )
)
with check (
  exists (
    select 1
    from public.crm_contacts c
    where c.id = contact_id
      and (
        public.crm_is_admin(auth.uid())
        or c.owner_user_id = auth.uid()
      )
  )
);

drop policy if exists crm_tasks_policy on public.crm_tasks;
create policy crm_tasks_policy on public.crm_tasks
for all using (
  public.crm_is_admin(auth.uid())
  or assignee_user_id = auth.uid()
  or exists (
    select 1 from public.crm_contacts c
    where c.id = contact_id and c.owner_user_id = auth.uid()
  )
)
with check (
  public.crm_is_admin(auth.uid())
  or assignee_user_id = auth.uid()
  or exists (
    select 1 from public.crm_contacts c
    where c.id = contact_id and c.owner_user_id = auth.uid()
  )
);

drop policy if exists crm_products_read_all on public.crm_products;
create policy crm_products_read_all on public.crm_products
for select using (auth.uid() is not null);

drop policy if exists crm_products_admin_write on public.crm_products;
create policy crm_products_admin_write on public.crm_products
for all using (public.crm_is_admin(auth.uid()))
with check (public.crm_is_admin(auth.uid()));

drop policy if exists crm_orders_policy on public.crm_orders;
create policy crm_orders_policy on public.crm_orders
for all using (
  exists (
    select 1
    from public.crm_contacts c
    where c.id = contact_id
      and (
        public.crm_is_admin(auth.uid())
        or c.owner_user_id = auth.uid()
      )
  )
)
with check (
  exists (
    select 1
    from public.crm_contacts c
    where c.id = contact_id
      and (
        public.crm_is_admin(auth.uid())
        or c.owner_user_id = auth.uid()
      )
  )
);

drop policy if exists crm_bot_sessions_policy on public.crm_bot_sessions;
create policy crm_bot_sessions_policy on public.crm_bot_sessions
for all using (
  exists (
    select 1
    from public.crm_contacts c
    where c.id = contact_id
      and (
        public.crm_is_admin(auth.uid())
        or c.owner_user_id = auth.uid()
      )
  )
)
with check (
  exists (
    select 1
    from public.crm_contacts c
    where c.id = contact_id
      and (
        public.crm_is_admin(auth.uid())
        or c.owner_user_id = auth.uid()
      )
  )
);

drop policy if exists crm_outbox_admin_policy on public.crm_outbox_events;
create policy crm_outbox_admin_policy on public.crm_outbox_events
for all using (public.crm_is_admin(auth.uid()))
with check (public.crm_is_admin(auth.uid()));

insert into public.crm_pipeline_stages (code, name, sort_order, is_final, is_success)
values
  ('new_lead', 'Новый лид', 10, false, false),
  ('qualified', 'Квалифицирован', 20, false, false),
  ('contacted', 'Связались', 30, false, false),
  ('offer_sent', 'Оффер отправлен', 40, false, false),
  ('payment_pending', 'Ожидание оплаты', 50, false, false),
  ('won', 'Успешно закрыт', 60, true, true),
  ('lost', 'Потерян', 70, true, false)
on conflict (code) do update
set
  name = excluded.name,
  sort_order = excluded.sort_order,
  is_final = excluded.is_final,
  is_success = excluded.is_success,
  is_active = true;

insert into public.crm_products (name, product_type, price)
values
  ('Диагностика', 'consultation', 5000.00),
  ('Подарочный разбор', 'consultation', 0.00),
  ('Сборники практик', 'mini_course', 5.00)
on conflict (name) do nothing;

commit;


-- >>> FILE: supabase/migrations/20260426011000_mini_crm_functions.sql <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

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


-- >>> FILE: supabase/migrations/20260426220000_crm_rls_staff_access.sql <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

begin;

-- Staff = запись в crm_profiles с активной ролью admin | manager | viewer
create or replace function public.crm_has_staff_access(user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1
    from public.crm_profiles p
    where p.id = user_id
      and p.is_active = true
      and p.role in ('admin', 'manager', 'viewer')
  );
$$;

-- Запись в CRM: admin и manager (не viewer)
create or replace function public.crm_can_write_crm(user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1
    from public.crm_profiles p
    where p.id = user_id
      and p.is_active = true
      and p.role in ('admin', 'manager')
  );
$$;

revoke all on function public.crm_has_staff_access(uuid) from public;
revoke all on function public.crm_can_write_crm(uuid) from public;
grant execute on function public.crm_has_staff_access(uuid) to authenticated;
grant execute on function public.crm_can_write_crm(uuid) to authenticated;

-- crm_profiles
drop policy if exists crm_profiles_select on public.crm_profiles;
drop policy if exists crm_profiles_admin_manage on public.crm_profiles;
create policy crm_profiles_select on public.crm_profiles
for select using (
  auth.uid() = id
  or public.crm_is_admin(auth.uid())
  or public.crm_has_staff_access(auth.uid())
);

create policy crm_profiles_self_update on public.crm_profiles
for update using (auth.uid() = id)
with check (auth.uid() = id);

create policy crm_profiles_admin_write on public.crm_profiles
for all using (public.crm_is_admin(auth.uid()))
with check (public.crm_is_admin(auth.uid()));

-- crm_pipeline_stages
drop policy if exists crm_pipeline_stages_read_all on public.crm_pipeline_stages;
drop policy if exists crm_pipeline_stages_admin_write on public.crm_pipeline_stages;
create policy crm_pipeline_stages_read on public.crm_pipeline_stages
for select using (public.crm_has_staff_access(auth.uid()));

create policy crm_pipeline_stages_admin_write on public.crm_pipeline_stages
for all using (public.crm_is_admin(auth.uid()))
with check (public.crm_is_admin(auth.uid()));

-- crm_contacts
drop policy if exists crm_contacts_select_policy on public.crm_contacts;
drop policy if exists crm_contacts_insert_policy on public.crm_contacts;
drop policy if exists crm_contacts_update_policy on public.crm_contacts;
create policy crm_contacts_select on public.crm_contacts
for select using (public.crm_has_staff_access(auth.uid()));

create policy crm_contacts_write on public.crm_contacts
for insert with check (public.crm_can_write_crm(auth.uid()));

create policy crm_contacts_update on public.crm_contacts
for update using (public.crm_can_write_crm(auth.uid()))
with check (public.crm_can_write_crm(auth.uid()));

create policy crm_contacts_delete on public.crm_contacts
for delete using (public.crm_can_write_crm(auth.uid()));

-- crm_contact_stage_history
drop policy if exists crm_contact_stage_history_policy on public.crm_contact_stage_history;
create policy crm_contact_stage_history_select on public.crm_contact_stage_history
for select using (public.crm_has_staff_access(auth.uid()));

create policy crm_contact_stage_history_write on public.crm_contact_stage_history
for all using (public.crm_can_write_crm(auth.uid()))
with check (public.crm_can_write_crm(auth.uid()));

-- crm_interactions
drop policy if exists crm_interactions_policy on public.crm_interactions;
create policy crm_interactions_select on public.crm_interactions
for select using (public.crm_has_staff_access(auth.uid()));

create policy crm_interactions_write on public.crm_interactions
for all using (public.crm_can_write_crm(auth.uid()))
with check (public.crm_can_write_crm(auth.uid()));

-- crm_tasks
drop policy if exists crm_tasks_policy on public.crm_tasks;
create policy crm_tasks_select on public.crm_tasks
for select using (public.crm_has_staff_access(auth.uid()));

create policy crm_tasks_write on public.crm_tasks
for all using (public.crm_can_write_crm(auth.uid()))
with check (public.crm_can_write_crm(auth.uid()));

-- crm_products
drop policy if exists crm_products_read_all on public.crm_products;
drop policy if exists crm_products_admin_write on public.crm_products;
create policy crm_products_select on public.crm_products
for select using (public.crm_has_staff_access(auth.uid()));

create policy crm_products_admin_write on public.crm_products
for all using (public.crm_is_admin(auth.uid()))
with check (public.crm_is_admin(auth.uid()));

-- crm_orders
drop policy if exists crm_orders_policy on public.crm_orders;
create policy crm_orders_select on public.crm_orders
for select using (public.crm_has_staff_access(auth.uid()));

create policy crm_orders_write on public.crm_orders
for all using (public.crm_can_write_crm(auth.uid()))
with check (public.crm_can_write_crm(auth.uid()));

-- crm_bot_sessions
drop policy if exists crm_bot_sessions_policy on public.crm_bot_sessions;
create policy crm_bot_sessions_select on public.crm_bot_sessions
for select using (public.crm_has_staff_access(auth.uid()));

create policy crm_bot_sessions_write on public.crm_bot_sessions
for all using (public.crm_can_write_crm(auth.uid()))
with check (public.crm_can_write_crm(auth.uid()));

-- crm_outbox
drop policy if exists crm_outbox_admin_policy on public.crm_outbox_events;
create policy crm_outbox_admin_policy on public.crm_outbox_events
for all using (public.crm_is_admin(auth.uid()))
with check (public.crm_is_admin(auth.uid()));

-- Первый admin (после регистрации в Auth с этим email)
insert into public.crm_profiles (id, role, display_name, is_active)
select u.id, 'admin', coalesce(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)), true
from auth.users u
where u.email = 'bormotovilya@gmail.com'
on conflict (id) do update
set
  role = 'admin',
  is_active = true,
  display_name = coalesce(excluded.display_name, public.crm_profiles.display_name);

commit;


-- >>> FILE: supabase/migrations/20260427121000_crm_funnel_site_events.sql <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

begin;

insert into public.crm_pipeline_stages (code, name, sort_order, is_final, is_success, is_active)
values
  ('diagnostic_requested', 'Запрос на диагностику', 15, false, false, true),
  ('quiz_completed', 'Прошел квиз', 16, false, false, true),
  ('gift_received', 'Получил подарок', 17, false, false, true),
  ('bot_started', 'Запустил бота', 18, false, false, true)
on conflict (code) do update
set
  name = excluded.name,
  sort_order = excluded.sort_order,
  is_final = excluded.is_final,
  is_success = excluded.is_success,
  is_active = true;

commit;


-- >>> FILE: supabase/migrations/20260501173000_crm_pipeline_alignment.sql <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

begin;

-- sort_order глобально unique. Без этого UPDATE возможен 23505: «qualified» из mini_crm (20)
-- конфликтует с INSERT «diagnostic_requested» (20), если блок выше вырезан или транзакция не дошла сюда.
-- Ещё тот случай: не применили 20260427121000 — тогда перед INSERT нет строки diagnostic_requested (ON CONFLICT),
-- но qualified всё ещё с sort_order = 20. Сначала выполните scripts/crm/05_repair_pipeline_sort_order_conflicts.sql
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


-- >>> FILE: supabase/migrations/20260502120000_crm_db_hardening.sql <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

begin;

-- Списки по контакту и отчёты по этапу: дополнительные покрывающие индексы (FK уже есть).
create index if not exists crm_contact_stage_history_to_stage_idx on public.crm_contact_stage_history(to_stage_id);
create index if not exists crm_contact_stage_history_from_stage_idx on public.crm_contact_stage_history(from_stage_id)
  where from_stage_id is not null;

create index if not exists crm_tasks_contact_idx on public.crm_tasks(contact_id, created_at desc);

comment on table public.crm_pipeline_stages is 'Справочник этапов воронки (code уникален; sort_order уникален глобально).';
comment on table public.crm_contacts is 'Лиды CRM: текущий этап — current_stage_id → crm_pipeline_stages.';
comment on table public.crm_contact_stage_history is 'Журнал переходов контакта между этапами.';

commit;


-- >>> FILE: supabase/migrations/20260503120000_crm_list_page_and_dashboard_rpc.sql <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

begin;

-- Список контактов с фильтрами, сортировкой и total (без загрузки всей таблицы в браузер).
create or replace function public.crm_list_contacts_page(
  p_quick_source text default 'all',
  p_exact_channel text default null,
  p_stage_id uuid default null,
  p_temperature text default null,
  p_duplicate_filter text default 'any',
  p_segment_exact text default null,
  p_search text default null,
  p_require_telegram boolean default false,
  p_require_phone boolean default false,
  p_require_email boolean default false,
  p_consent_only boolean default false,
  p_owner_filter text default 'any',
  p_my_user_id uuid default null,
  p_next_action_preset text default 'any',
  p_na_day_start timestamptz default null,
  p_na_day_end timestamptz default null,
  p_sort text default 'activity',
  p_limit int default 25,
  p_offset int default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_quick text := lower(trim(coalesce(p_quick_source, 'all')));
  v_dup text := lower(trim(coalesce(p_duplicate_filter, 'any')));
  v_owner text := lower(trim(coalesce(p_owner_filter, 'any')));
  v_na text := lower(trim(coalesce(p_next_action_preset, 'any')));
  v_sort text := lower(trim(coalesce(p_sort, 'activity')));
  v_lim int := greatest(1, least(coalesce(p_limit, 25), 200));
  v_off int := greatest(0, coalesce(p_offset, 0));
  v_search text := nullif(trim(lower(coalesce(p_search, ''))), '');
  v_exact_channel text := nullif(trim(coalesce(p_exact_channel, '')), '');
  v_segment_exact text := nullif(trim(coalesce(p_segment_exact, '')), '');
  v_total bigint := 0;
  v_rows jsonb := '[]'::jsonb;
begin
  if not public.crm_has_staff_access(auth.uid()) then
    return jsonb_build_object('rows', '[]'::jsonb, 'total', 0);
  end if;

  with base as (
    select c.*
    from public.crm_contacts c
    where true
      -- точный канал
      and (
        v_exact_channel is null
        or trim(coalesce(c.source_channel, '')) = v_exact_channel
      )
      and (
        v_exact_channel is not null
        or v_quick = 'all'
        or (v_quick = 'site' and trim(coalesce(c.source_channel, '')) in ('site', 'site_form', 'site_quiz'))
        or (
          v_quick = 'telegram'
          and (
            c.telegram_id is not null
            or trim(coalesce(c.source_channel, '')) = 'telegram_bot'
          )
        )
        or (
          v_quick = 'unknown'
          and (
            trim(coalesce(c.source_channel, '')) = ''
            or trim(coalesce(c.source_channel, '')) = 'unknown'
          )
        )
      )
      and (p_stage_id is null or c.current_stage_id = p_stage_id)
      and (
        p_temperature is null
        or trim(p_temperature) = ''
        or coalesce(nullif(trim(c.lead_temperature), ''), 'cold') = trim(p_temperature)
      )
      and (
        v_dup = 'any'
        or (v_dup = 'only' and c.is_duplicate = true)
        or (v_dup = 'hide' and coalesce(c.is_duplicate, false) = false)
      )
      and (v_segment_exact is null or trim(coalesce(c.segment, '')) = v_segment_exact)
      and (not p_require_telegram or c.telegram_id is not null)
      and (not p_require_phone or (c.phone is not null and trim(c.phone) <> ''))
      and (not p_require_email or (c.email is not null and trim(c.email) <> ''))
      and (not p_consent_only or c.consent_personal_data = true)
      and (
        v_owner = 'any'
        or (v_owner = 'mine' and p_my_user_id is not null and c.owner_user_id = p_my_user_id)
        or (v_owner = 'unassigned' and c.owner_user_id is null)
      )
      and (
        v_na = 'any'
        or (v_na = 'scheduled' and c.next_action_at is not null)
        or (v_na = 'overdue' and c.next_action_at is not null and c.next_action_at < timezone('utc', now()))
        or (
          v_na = 'today'
          and c.next_action_at is not null
          and p_na_day_start is not null
          and p_na_day_end is not null
          and c.next_action_at >= p_na_day_start
          and c.next_action_at <= p_na_day_end
        )
      )
      and (
        v_search is null
        or lower(concat_ws(
          ' ',
          coalesce(c.full_name, ''),
          coalesce(c.email, ''),
          coalesce(c.phone, ''),
          coalesce(c.source_detail, ''),
          coalesce(c.segment, ''),
          coalesce(c.utm_source, ''),
          coalesce(c.utm_campaign, '')
        )) like '%' || v_search || '%'
      )
  )
  select
    (select count(*)::bigint from base),
    coalesce(
      (
        select jsonb_agg(to_jsonb(t.*))
        from (
          select *
          from base b
          order by
            case when v_sort = 'created' then b.created_at end desc nulls last,
            case when v_sort = 'next_action' then b.next_action_at end asc nulls last,
            case when v_sort = 'activity' then b.last_activity_at end desc nulls last,
            case when v_sort = 'activity' then b.created_at end desc nulls last,
            b.id asc
          limit v_lim offset v_off
        ) t
      ),
      '[]'::jsonb
    )
  into v_total, v_rows;

  return jsonb_build_object('rows', coalesce(v_rows, '[]'::jsonb), 'total', coalesce(v_total, 0));
end;
$$;

revoke all on function public.crm_list_contacts_page(
  text, text, uuid, text, text, text, text, boolean, boolean, boolean, boolean,
  text, uuid, text, timestamptz, timestamptz, text, int, int
) from public;
grant execute on function public.crm_list_contacts_page(
  text, text, uuid, text, text, text, text, boolean, boolean, boolean, boolean,
  text, uuid, text, timestamptz, timestamptz, text, int, int
) to authenticated;

-- Быстрые счётчики по источнику + уникальные каналы/сегменты для фильтров.
create or replace function public.crm_contacts_meta()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_all bigint;
  v_site bigint;
  v_tg bigint;
  v_unknown bigint;
  v_channels jsonb;
  v_segments jsonb;
begin
  if not public.crm_has_staff_access(auth.uid()) then
    return jsonb_build_object(
      'quick_counts', jsonb_build_object('all', 0, 'site', 0, 'telegram', 0, 'unknown', 0),
      'channels', '[]'::jsonb,
      'segments', '[]'::jsonb
    );
  end if;

  select count(*) into v_all from public.crm_contacts;

  select count(*) into v_site
  from public.crm_contacts c
  where trim(coalesce(c.source_channel, '')) in ('site', 'site_form', 'site_quiz');

  select count(*) into v_tg
  from public.crm_contacts c
  where c.telegram_id is not null or trim(coalesce(c.source_channel, '')) = 'telegram_bot';

  select count(*) into v_unknown
  from public.crm_contacts c
  where trim(coalesce(c.source_channel, '')) = '' or trim(coalesce(c.source_channel, '')) = 'unknown';

  select coalesce(jsonb_agg(ch order by ch), '[]'::jsonb)
  into v_channels
  from (
    select distinct trim(coalesce(source_channel, '')) as ch
    from public.crm_contacts
    where trim(coalesce(source_channel, '')) <> ''
  ) s;

  select coalesce(jsonb_agg(seg order by seg), '[]'::jsonb)
  into v_segments
  from (
    select distinct trim(segment) as seg
    from public.crm_contacts
    where segment is not null and trim(segment) <> ''
  ) s2;

  return jsonb_build_object(
    'quick_counts', jsonb_build_object(
      'all', v_all,
      'site', v_site,
      'telegram', v_tg,
      'unknown', v_unknown
    ),
    'channels', v_channels,
    'segments', v_segments
  );
end;
$$;

revoke all on function public.crm_contacts_meta() from public;
grant execute on function public.crm_contacts_meta() to authenticated;

-- Агрегаты дашборда: воронка, конверсия между соседними этапами, топ каналов, SLA-прокси, тренд 7 дней.
create or replace function public.crm_dashboard_metrics()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_week_ago timestamptz := v_now - interval '7 days';
  v_month_ago timestamptz := v_now - interval '30 days';
  v_total bigint;
  v_new_week bigint;
  v_funnel jsonb;
  v_conversion jsonb;
  v_sources jsonb;
  v_sla jsonb;
  v_trend jsonb;
begin
  if not public.crm_has_staff_access(auth.uid()) then
    return '{}'::jsonb;
  end if;

  select count(*) into v_total from public.crm_contacts;

  select count(*) into v_new_week
  from public.crm_contacts c
  where c.created_at >= v_week_ago;

  with stages as (
    select id, code, name, sort_order
    from public.crm_pipeline_stages
    where is_active = true
  ),
  counts as (
    select s.id as stage_id, s.code, s.name, s.sort_order, count(c.id)::bigint as cnt
    from stages s
    left join public.crm_contacts c on c.current_stage_id = s.id
    group by s.id, s.code, s.name, s.sort_order
  ),
  conv as (
    select
      code,
      name,
      sort_order,
      cnt,
      lag(cnt) over (order by sort_order) as prev_cnt
    from counts
  )
  select
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'stage_id', stage_id,
            'code', code,
            'name', name,
            'sort_order', sort_order,
            'count', cnt
          )
          order by sort_order
        )
        from counts
      ),
      '[]'::jsonb
    ),
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'code', code,
            'name', name,
            'sort_order', sort_order,
            'count', cnt,
            'pct_of_previous',
            case
              when prev_cnt is null or prev_cnt = 0 then null
              else round((100.0 * cnt::numeric / prev_cnt::numeric)::numeric, 1)
            end
          )
          order by sort_order
        )
        from conv
      ),
      '[]'::jsonb
    )
  into v_funnel, v_conversion;

  select
    coalesce(
      jsonb_agg(
        jsonb_build_object('channel', ch, 'count', n)
        order by n desc, ch
      ),
      '[]'::jsonb
    )
  into v_sources
  from (
    select
      case
        when trim(coalesce(source_channel, '')) = '' then '(пусто)'
        else trim(coalesce(source_channel, ''))
      end as ch,
      count(*)::bigint as n
    from public.crm_contacts
    group by 1
    order by n desc, ch
    limit 24
  ) t;

  -- SLA-прокси: среди лидов за 30 дней с известной last_activity — доля с реакцией ≤ 24 ч.
  with cohort as (
    select
      c.created_at,
      c.last_activity_at,
      extract(epoch from (c.last_activity_at - c.created_at)) / 3600.0 as hours_to_activity
    from public.crm_contacts c
    where c.created_at >= v_month_ago
      and c.last_activity_at is not null
      and c.last_activity_at >= c.created_at
  )
  select jsonb_build_object(
    'cohort_with_activity', (select count(*)::bigint from cohort),
    'pct_within_24h',
    case
      when (select count(*) from cohort) = 0 then null
      else round(
        (
          100.0 * (select count(*) from cohort where hours_to_activity <= 24)::numeric
          / (select count(*) from cohort)::numeric
        )::numeric,
        1
      )
    end,
    'median_hours_to_activity',
    case
      when (select count(*) from cohort) = 0 then null
      else round(
        (select percentile_disc(0.5) within group (order by hours_to_activity) from cohort)::numeric,
        2
      )
    end
  )
  into v_sla;

  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'key', d::text,
          'count', n
        )
        order by d
      ),
      '[]'::jsonb
    )
  into v_trend
  from (
    select day_d::date as d, count(c.id)::bigint as n
    from generate_series(
      (timezone('utc', now()))::date - 6,
      (timezone('utc', now()))::date,
      interval '1 day'
    ) day_d
    left join public.crm_contacts c
      on (c.created_at at time zone 'utc')::date = day_d::date
    group by day_d::date
  ) tr;

  return jsonb_build_object(
    'total_contacts', v_total,
    'new_contacts_last_7d', v_new_week,
    'funnel', v_funnel,
    'stage_conversion', v_conversion,
    'top_source_channels', v_sources,
    'sla_first_activity', v_sla,
    'new_per_day_utc_7d', v_trend
  );
end;
$$;

revoke all on function public.crm_dashboard_metrics() from public;
grant execute on function public.crm_dashboard_metrics() to authenticated;

commit;
