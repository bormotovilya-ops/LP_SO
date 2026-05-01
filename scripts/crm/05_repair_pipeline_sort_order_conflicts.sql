-- Выполнить в Supabase SQL Editor при ошибке:
-- duplicate key violates unique constraint "crm_pipeline_stages_sort_order_key"
--
-- Освобождает значения sort_order 10–999 перед повторным прогоном блока INSERT
-- из 20260501173000_crm_pipeline_alignment.sql.

begin;

update public.crm_pipeline_stages
set sort_order = sort_order + 1000000
where sort_order < 1000000;

commit;
