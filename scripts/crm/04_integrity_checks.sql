-- Проверки целостности после миграций / перед релизом.
-- Ожидание: каждый блок возвращает 0 строк — иначе есть расхождения данных.

-- 1) Уникальность sort_order в воронке
select ps.id, ps.code, ps.sort_order
from public.crm_pipeline_stages ps
join (
  select sort_order from public.crm_pipeline_stages group by sort_order having count(*) > 1
) d on d.sort_order = ps.sort_order;

-- 2) Контакт ссылается на несуществующий этап (если обходили FK вручную / старый баг)
select c.id, c.current_stage_id
from public.crm_contacts c
left join public.crm_pipeline_stages s on s.id = c.current_stage_id
where c.current_stage_id is not null and s.id is null;

-- 3) История: битые to_stage_id / from_stage_id
select h.id, h.contact_id, h.to_stage_id, 'missing to_stage'::text as issue
from public.crm_contact_stage_history h
left join public.crm_pipeline_stages t on t.id = h.to_stage_id
where t.id is null
union all
select h.id, h.contact_id, h.from_stage_id, 'missing from_stage'::text
from public.crm_contact_stage_history h
left join public.crm_pipeline_stages f on f.id = h.from_stage_id
where h.from_stage_id is not null and f.id is null;
