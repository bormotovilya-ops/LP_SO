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
