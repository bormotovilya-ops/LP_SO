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
