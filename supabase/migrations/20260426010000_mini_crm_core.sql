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
