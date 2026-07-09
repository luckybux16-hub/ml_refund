alter table public.tickets
add column if not exists rework_target text not null default '';

alter table public.tickets
drop constraint if exists tickets_status_check;

alter table public.tickets
add constraint tickets_status_check
check (
  status in (
    'Чернетка',
    'Нове повернення',
    'На перевірку',
    'Повернення коштів',
    'Повернення здійснено ✅',
    'На доопрацювання',
    'Завершено без повернення',
    'Відхилено ❌',
    'Видалено'
  )
);
