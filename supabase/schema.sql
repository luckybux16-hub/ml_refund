create extension if not exists pgcrypto;

create table if not exists public.app_users (
  id uuid primary key references auth.users(id) on delete cascade,
  login text not null unique,
  email text not null unique,
  name text not null,
  role text not null check (role in ('warehouse', 'manager', 'head', 'accountant', 'admin')),
  brands text[] not null default '{}',
  active boolean not null default true,
  created_by uuid references public.app_users(id),
  updated_by uuid references public.app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_counters (
  brand text primary key,
  last_value integer not null default 0
);

insert into public.crm_counters (brand, last_value)
values ('MOOW', 0), ('LEXIE', 0)
on conflict (brand) do nothing;

create table if not exists public.directory_fops (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  payer_iban text not null default '',
  position integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.directory_reasons (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  reason_type text not null check (reason_type in ('regular', 'pre_shipment')),
  position integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  crm_id text unique,
  brand text not null check (brand in ('MOOW', 'LEXIE')),
  type text not null check (type in ('Повернення', 'Відмова на пошті', 'Відмова до відправки', 'Обмін')),
  status text not null check (status in ('Чернетка', 'Нове повернення', 'На перевірку', 'Повернення коштів', 'Повернення здійснено ✅', 'На доопрацювання', 'Завершено без повернення', 'Відхилено ❌', 'Видалено')),
  order_number text,
  warehouse_fop text,
  returned_product text,
  return_amount numeric(12,2) not null default 0,
  delivery_paid text,
  delivery_deduction numeric(12,2) not null default 0,
  photo_sent boolean not null default false,
  warehouse_comment text,
  manager_fop text,
  order_date text,
  order_time text,
  client_name text,
  reason text,
  other_reason_comment text,
  payment_method text,
  iban text,
  tax_id text,
  receiver_name text,
  payment_purpose text,
  manager_comment text,
  rework_target text not null default '',
  stock_offer_confirmed boolean not null default false,
  main_crm_return_status boolean not null default false,
  new_product text,
  new_product_price numeric(12,2) not null default 0,
  exchange_result text,
  client_extra_payment numeric(12,2) not null default 0,
  exchange_refund_amount numeric(12,2) not null default 0,
  warehouse_user_id uuid references public.app_users(id),
  manager_user_id uuid references public.app_users(id),
  reviewer_user_id uuid references public.app_users(id),
  accountant_user_id uuid references public.app_users(id),
  updated_by uuid references public.app_users(id),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ticket_comments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  comment_type text not null default 'comment',
  body text not null,
  author_user_id uuid references public.app_users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid references public.tickets(id) on delete set null,
  actor_user_id uuid references public.app_users(id),
  action text not null,
  brand text,
  crm_id text,
  order_number text,
  previous_value text,
  new_value text,
  device text,
  ip_address text,
  created_at timestamptz not null default now()
);

create table if not exists public.login_events (
  id uuid primary key default gen_random_uuid(),
  login text not null,
  success boolean not null default false,
  user_id uuid references public.app_users(id) on delete set null,
  device text,
  ip_address text,
  created_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists app_users_touch_updated_at on public.app_users;
create trigger app_users_touch_updated_at
before update on public.app_users
for each row execute function public.touch_updated_at();

drop trigger if exists tickets_touch_updated_at on public.tickets;
create trigger tickets_touch_updated_at
before update on public.tickets
for each row execute function public.touch_updated_at();

create or replace function public.next_crm_id(target_brand text)
returns text
language plpgsql
security definer
as $$
declare
  next_value integer;
begin
  update public.crm_counters
  set last_value = last_value + 1
  where brand = target_brand
  returning last_value into next_value;

  if next_value is null then
    insert into public.crm_counters (brand, last_value)
    values (target_brand, 1)
    on conflict (brand) do update set last_value = public.crm_counters.last_value + 1
    returning last_value into next_value;
  end if;

  return target_brand || '-' || lpad(next_value::text, 6, '0');
end;
$$;

create or replace function public.assign_crm_id()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.crm_id is null and new.status <> 'Чернетка' then
    new.crm_id = public.next_crm_id(new.brand);
  end if;
  return new;
end;
$$;

drop trigger if exists tickets_assign_crm_id on public.tickets;
create trigger tickets_assign_crm_id
before insert on public.tickets
for each row execute function public.assign_crm_id();

insert into public.directory_fops (name, position)
values
  ('ФОП Тарасова', 10),
  ('ФОП Левицький', 20),
  ('ФОП Кильницька', 30),
  ('ФОП Дротенко', 40),
  ('Оплата на сайті', 50)
on conflict (name) do nothing;

insert into public.directory_reasons (name, reason_type, position)
values
  ('Не сподобалась якість', 'regular', 10),
  ('Не підійшов розмір', 'regular', 20),
  ('Не підійшов розмір (потрібен більший)', 'regular', 30),
  ('Не підійшов розмір (потрібен менший)', 'regular', 40),
  ('Не встигла забрати', 'regular', 50),
  ('Виглядає не так як очікувала', 'regular', 60),
  ('Не мій фасон', 'regular', 70),
  ('Брак з вини цеху', 'regular', 80),
  ('Брак', 'regular', 90),
  ('Інше', 'regular', 100),
  ('Не хоче чекати', 'pre_shipment', 110),
  ('Товара немає в наявності (і не буде)', 'pre_shipment', 120),
  ('Товара немає в наявності (і не хоче чекати)', 'pre_shipment', 130)
on conflict (name) do nothing;

alter table public.app_users enable row level security;
alter table public.directory_fops enable row level security;
alter table public.directory_reasons enable row level security;
alter table public.tickets enable row level security;
alter table public.ticket_comments enable row level security;
alter table public.audit_logs enable row level security;
alter table public.login_events enable row level security;

drop policy if exists "profiles: read own" on public.app_users;
create policy "profiles: read own"
on public.app_users
for select
to authenticated
using (auth.uid() = id);

drop policy if exists "fops: read authenticated" on public.directory_fops;
create policy "fops: read authenticated"
on public.directory_fops
for select
to authenticated
using (true);

drop policy if exists "reasons: read authenticated" on public.directory_reasons;
create policy "reasons: read authenticated"
on public.directory_reasons
for select
to authenticated
using (true);
