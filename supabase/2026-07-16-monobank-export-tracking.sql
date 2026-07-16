alter table public.tickets
add column if not exists monobank_exported_at timestamptz,
add column if not exists monobank_exported_by uuid references public.app_users(id);
