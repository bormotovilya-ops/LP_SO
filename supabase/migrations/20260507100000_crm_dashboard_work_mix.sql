begin;

-- Расширение дашборда: смесь температур + «следующий шаг»; убираем неиспользуемый stage_conversion из ответа.
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
  v_temp jsonb;
  v_next_step jsonb;
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

  select jsonb_build_array(
    jsonb_build_object(
      'code', 'cold',
      'label', 'Холодный',
      'count',
      (select count(*)::bigint from public.crm_contacts c where coalesce(nullif(trim(c.lead_temperature), ''), 'cold') = 'cold')
    ),
    jsonb_build_object(
      'code', 'warm',
      'label', 'Тёплый',
      'count',
      (select count(*)::bigint from public.crm_contacts c where trim(coalesce(c.lead_temperature, '')) = 'warm')
    ),
    jsonb_build_object(
      'code', 'hot',
      'label', 'Горячий',
      'count',
      (select count(*)::bigint from public.crm_contacts c where trim(coalesce(c.lead_temperature, '')) = 'hot')
    )
  )
  into v_temp;

  select jsonb_build_array(
    jsonb_build_object(
      'code', 'no_date',
      'label', 'Без даты шага',
      'count',
      (select count(*)::bigint from public.crm_contacts c where c.next_action_at is null)
    ),
    jsonb_build_object(
      'code', 'overdue',
      'label', 'Просрочено',
      'count',
      (
        select count(*)::bigint
        from public.crm_contacts c
        where c.next_action_at is not null
          and c.next_action_at < v_now
      )
    ),
    jsonb_build_object(
      'code', 'scheduled',
      'label', 'Есть шаг вперёд',
      'count',
      (
        select count(*)::bigint
        from public.crm_contacts c
        where c.next_action_at is not null
          and c.next_action_at >= v_now
      )
    )
  )
  into v_next_step;

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
    'lead_temperature_mix', coalesce(v_temp, '[]'::jsonb),
    'next_action_mix', coalesce(v_next_step, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.crm_dashboard_metrics() from public;
grant execute on function public.crm_dashboard_metrics() to authenticated;

commit;
