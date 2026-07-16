alter table public.directory_fops
add column if not exists payer_iban text not null default '';
