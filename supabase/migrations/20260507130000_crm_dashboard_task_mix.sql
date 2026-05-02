begin;

-- Дашборд: вместо температуры/«следующего шага» — задачи по статусам и по ответственным (активные).
create or replace function public.crm_dashboard_metrics()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_week_ago timestamptz := v_now - interval '7 days';
  v_month_ago timestamptz := v_now - interval '30 days';
  v_total bigint;
  v_new_week bigint;
  v_funnel jsonb;
  v_sources jsonb;
  v_sla jsonb;
  v_trend jsonb;
  v_task_status jsonb;
  v_task_assignee jsonb;
  v_task_active bigint;
  v_task_overdue_active bigint;
  v_tasks_total bigint;
begin
  if not public.crm_has_staff_access(auth.uid()) then
    return '{}'::jsonb;
  end if;

  select count(*) into v_total from public.crm_contacts;

  select count(*) into v_new_week
  from public.crm_contacts c
  where c.created_at >= v_week_ago;

  with stages as (
    select id, code, name, sort_order
    from public.crm_pipeline_stages
    where is_active = true
  ),
  counts as (
    select s.id as stage_id, s.code, s.name, s.sort_order, count(c.id)::bigint as cnt
    from stages s
    left join public.crm_contacts c on c.current_stage_id = s.id
    group by s.id, s.code, s.name, s.sort_order
  )
  select coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'stage_id', stage_id,
          'code', code,
          'name', name,
          'sort_order', sort_order,
          'count', cnt
        )
        order by sort_order
      )
      from counts
    ),
    '[]'::jsonb
  )
  into v_funnel;

  select count(*)::bigint into v_tasks_total from public.crm_tasks;

  select count(*)::bigint into v_task_active
  from public.crm_tasks t
  where t.status in ('open', 'in_progress');

  select count(*)::bigint into v_task_overdue_active
  from public.crm_tasks t
  where t.status in ('open', 'in_progress')
    and t.due_at is not null
    and t.due_at < v_now;

  select jsonb_build_array(
    jsonb_build_object(
      'code', 'open',
      'label', 'Открыта',
      'count',
      (select count(*)::bigint from public.crm_tasks t where t.status = 'open')
    ),
    jsonb_build_object(
      'code', 'in_progress',
      'label', 'В работе',
      'count',
      (select count(*)::bigint from public.crm_tasks t where t.status = 'in_progress')
    ),
    jsonb_build_object(
      'code', 'done',
      'label', 'Завершена',
      'count',
      (select count(*)::bigint from public.crm_tasks t where t.status = 'done')
    ),
    jsonb_build_object(
      'code', 'cancelled',
      'label', 'Отменена',
      'count',
      (select count(*)::bigint from public.crm_tasks t where t.status = 'cancelled')
    )
  )
  into v_task_status;

  select coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'code', q.assign_key,
          'label', q.lbl,
          'count', q.cnt
        )
        order by q.cnt desc, q.lbl
      )
      from (
        select
          coalesce(g.assignee_user_id::text, '_unassigned') as assign_key,
          case
            when g.assignee_user_id is null then 'Не назначено'
            else coalesce(nullif(trim(p.display_name), ''), 'id ' || left(g.assignee_user_id::text, 8))
          end as lbl,
          g.cnt
        from (
          select t.assignee_user_id, count(*)::bigint as cnt
          from public.crm_tasks t
          where t.status in ('open', 'in_progress')
          group by t.assignee_user_id
        ) g
        left join public.crm_profiles p on p.id = g.assignee_user_id and p.is_active = true
        order by g.cnt desc
        limit 14
      ) q
    ),
    '[]'::jsonb
  )
  into v_task_assignee;

  select
    coalesce(
      jsonb_agg(
        jsonb_build_object('channel', ch, 'count', n)
        order by sort_idx, ch
      ),
      '[]'::jsonb
    )
  into v_sources
  from (
    select
      case lower(trim(coalesce(source_channel, '')))
        when 'crm' then 'CRM'
        when 'bot' then 'Бот'
        when 'site' then 'Сайт'
        when 'channel' then 'Канал'
        when 'vk' then 'Вк'
        when 'instagram' then 'Instagram'
        else 'Другое'
      end as ch,
      case lower(trim(coalesce(source_channel, '')))
        when 'crm' then 1
        when 'bot' then 2
        when 'site' then 3
        when 'channel' then 4
        when 'vk' then 5
        when 'instagram' then 6
        else 7
      end as sort_idx,
      count(*)::bigint as n
    from public.crm_contacts
    group by 1, 2
    order by sort_idx, ch
  ) t;

  with cohort as (
    select
      c.created_at,
      c.last_activity_at,
      extract(epoch from (c.last_activity_at - c.created_at)) / 3600.0 as hours_to_activity
    from public.crm_contacts c
    where c.created_at >= v_month_ago
      and c.last_activity_at is not null
      and c.last_activity_at >= c.created_at
  )
  select jsonb_build_object(
    'cohort_with_activity', (select count(*)::bigint from cohort),
    'pct_within_24h',
    case
      when (select count(*) from cohort) = 0 then null
      else round(
        (
          100.0 * (select count(*) from cohort where hours_to_activity <= 24)::numeric
          / (select count(*) from cohort)::numeric
        )::numeric,
        1
      )
    end,
    'median_hours_to_activity',
    case
      when (select count(*) from cohort) = 0 then null
      else round(
        (select percentile_disc(0.5) within group (order by hours_to_activity) from cohort)::numeric,
        2
      )
    end
  )
  into v_sla;

  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'key', d::text,
          'count', n
        )
        order by d
      ),
      '[]'::jsonb
    )
  into v_trend
  from (
    select day_d::date as d, count(c.id)::bigint as n
    from generate_series(
      (timezone('utc', now()))::date - 6,
      (timezone('utc', now()))::date,
      interval '1 day'
    ) day_d
    left join public.crm_contacts c
      on (c.created_at at time zone 'utc')::date = day_d::date
    group by day_d::date
  ) tr;

  return jsonb_build_object(
    'total_contacts', v_total,
    'new_contacts_last_7d', v_new_week,
    'funnel', v_funnel,
    'top_source_channels', v_sources,
    'sla_first_activity', v_sla,
    'new_per_day_utc_7d', v_trend,
    'tasks_total_all', coalesce(v_tasks_total, 0),
    'tasks_active_open_progress', coalesce(v_task_active, 0),
    'tasks_overdue_active', coalesce(v_task_overdue_active, 0),
    'task_status_mix', coalesce(v_task_status, '[]'::jsonb),
    'task_assignee_active_mix', coalesce(v_task_assignee, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.crm_dashboard_metrics() from public;
grant execute on function public.crm_dashboard_metrics() to authenticated;

commit;
