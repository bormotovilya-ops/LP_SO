begin;

create table if not exists public.practices_payment_orders (
  order_id text primary key,
  provider text not null check (provider in ('tochka', 'tbank')),
  receipt_email text not null,
  amount_kopecks integer not null default 500 check (amount_kopecks > 0),
  status text not null default 'initiated' check (status in ('initiated', 'paid', 'failed')),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists practices_payment_orders_status_idx
  on public.practices_payment_orders (status, created_at desc);

comment on table public.practices_payment_orders is
  'Заказы оплаты сборника: initiated при payment-init, paid после webhook эквайера (service_role).';

create or replace function public.touch_practices_payment_orders_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists practices_payment_orders_touch on public.practices_payment_orders;

create trigger practices_payment_orders_touch
  before update on public.practices_payment_orders
  for each row
  execute function public.touch_practices_payment_orders_updated_at();

alter table public.practices_payment_orders enable row level security;

-- Политик нет: anon/authenticated через PostgREST не читают таблицу; Edge Functions используют service_role.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'practice_materials',
  'practice_materials',
  false,
  52428800,
  array['application/zip', 'application/octet-stream']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Bucket private по умолчанию: анонимы не получают прямых URL без signed URL через Edge Function (service_role).

commit;
