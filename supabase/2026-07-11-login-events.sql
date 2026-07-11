create table if not exists public.login_events (
  id uuid primary key default gen_random_uuid(),
  login text not null,
  success boolean not null default false,
  user_id uuid references public.app_users(id) on delete set null,
  device text,
  ip_address text,
  created_at timestamptz not null default now()
);

alter table public.login_events enable row level security;
