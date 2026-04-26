-- 1) Этапы воронки
select code, name, sort_order, is_final, is_success
from public.crm_pipeline_stages
order by sort_order;

-- 2) Общее число лидов
select count(*) as contacts_total from public.crm_contacts;

-- 3) Конверсия по текущим статусам
select s.code, s.name, count(c.id) as leads_count
from public.crm_pipeline_stages s
left join public.crm_contacts c on c.current_stage_id = s.id
group by s.code, s.name, s.sort_order
order by s.sort_order;

-- 4) Последние активности
select
  c.id,
  c.full_name,
  c.phone,
  c.email,
  s.code as current_stage,
  c.last_activity_at
from public.crm_contacts c
left join public.crm_pipeline_stages s on s.id = c.current_stage_id
order by c.last_activity_at desc nulls last
limit 20;
