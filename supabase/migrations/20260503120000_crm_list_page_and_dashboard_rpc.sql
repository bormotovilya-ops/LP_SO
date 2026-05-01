begin;

-- Список контактов с фильтрами, сортировкой и total (без загрузки всей таблицы в браузер).
create or replace function public.crm_list_contacts_page(
  p_quick_source text default 'all',
  p_exact_channel text default null,
  p_stage_id uuid default null,
  p_temperature text default null,
  p_duplicate_filter text default 'any',
  p_segment_exact text default null,
  p_search text default null,
  p_require_telegram boolean default false,
  p_require_phone boolean default false,
  p_require_email boolean default false,
  p_consent_only boolean default false,
  p_owner_filter text default 'any',
  p_my_user_id uuid default null,
  p_next_action_preset text default 'any',
  p_na_day_start timestamptz default null,
  p_na_day_end timestamptz default null,
  p_sort text default 'activity',
  p_limit int default 25,
  p_offset int default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_quick text := lower(trim(coalesce(p_quick_source, 'all')));
  v_dup text := lower(trim(coalesce(p_duplicate_filter, 'any')));
  v_owner text := lower(trim(coalesce(p_owner_filter, 'any')));
  v_na text := lower(trim(coalesce(p_next_action_preset, 'any')));
  v_sort text := lower(trim(coalesce(p_sort, 'activity')));
  v_lim int := greatest(1, least(coalesce(p_limit, 25), 200));
  v_off int := greatest(0, coalesce(p_offset, 0));
  v_search text := nullif(trim(lower(coalesce(p_search, ''))), '');
  v_exact_channel text := nullif(trim(coalesce(p_exact_channel, '')), '');
  v_segment_exact text := nullif(trim(coalesce(p_segment_exact, '')), '');
  v_total bigint := 0;
  v_rows jsonb := '[]'::jsonb;
begin
  if not public.crm_has_staff_access(auth.uid()) then
    return jsonb_build_object('rows', '[]'::jsonb, 'total', 0);
  end if;

  with base as (
    select c.*
    from public.crm_contacts c
    where true
      -- точный канал
      and (
        v_exact_channel is null
        or trim(coalesce(c.source_channel, '')) = v_exact_channel
      )
      and (
        v_exact_channel is not null
        or v_quick = 'all'
        or (v_quick = 'site' and trim(coalesce(c.source_channel, '')) in ('site', 'site_form', 'site_quiz'))
        or (
          v_quick = 'telegram'
          and (
            c.telegram_id is not null
            or trim(coalesce(c.source_channel, '')) = 'telegram_bot'
          )
        )
        or (
          v_quick = 'unknown'
          and (
            trim(coalesce(c.source_channel, '')) = ''
            or trim(coalesce(c.source_channel, '')) = 'unknown'
          )
        )
      )
      and (p_stage_id is null or c.current_stage_id = p_stage_id)
      and (
        p_temperature is null
        or trim(p_temperature) = ''
        or coalesce(nullif(trim(c.lead_temperature), ''), 'cold') = trim(p_temperature)
      )
      and (
        v_dup = 'any'
        or (v_dup = 'only' and c.is_duplicate = true)
        or (v_dup = 'hide' and coalesce(c.is_duplicate, false) = false)
      )
      and (v_segment_exact is null or trim(coalesce(c.segment, '')) = v_segment_exact)
      and (not p_require_telegram or c.telegram_id is not null)
      and (not p_require_phone or (c.phone is not null and trim(c.phone) <> ''))
      and (not p_require_email or (c.email is not null and trim(c.email) <> ''))
      and (not p_consent_only or c.consent_personal_data = true)
      and (
        v_owner = 'any'
        or (v_owner = 'mine' and p_my_user_id is not null and c.owner_user_id = p_my_user_id)
        or (v_owner = 'unassigned' and c.owner_user_id is null)
      )
      and (
        v_na = 'any'
        or (v_na = 'scheduled' and c.next_action_at is not null)
        or (v_na = 'overdue' and c.next_action_at is not null and c.next_action_at < timezone('utc', now()))
        or (
          v_na = 'today'
          and c.next_action_at is not null
          and p_na_day_start is not null
          and p_na_day_end is not null
          and c.next_action_at >= p_na_day_start
          and c.next_action_at <= p_na_day_end
        )
      )
      and (
        v_search is null
        or lower(concat_ws(
          ' ',
          coalesce(c.full_name, ''),
          coalesce(c.email, ''),
          coalesce(c.phone, ''),
          coalesce(c.source_detail, ''),
          coalesce(c.segment, ''),
          coalesce(c.utm_source, ''),
          coalesce(c.utm_campaign, '')
        )) like '%' || v_search || '%'
      )
  )
  select
    (select count(*)::bigint from base),
    coalesce(
      (
        select jsonb_agg(to_jsonb(t.*))
        from (
          select *
          from base b
          order by
            case when v_sort = 'created' then b.created_at end desc nulls last,
            case when v_sort = 'next_action' then b.next_action_at end asc nulls last,
            case when v_sort = 'activity' then b.last_activity_at end desc nulls last,
            case when v_sort = 'activity' then b.created_at end desc nulls last,
            b.id asc
          limit v_lim offset v_off
        ) t
      ),
      '[]'::jsonb
    )
  into v_total, v_rows;

  return jsonb_build_object('rows', coalesce(v_rows, '[]'::jsonb), 'total', coalesce(v_total, 0));
end;
$$;

revoke all on function public.crm_list_contacts_page(
  text, text, uuid, text, text, text, text, boolean, boolean, boolean, boolean,
  text, uuid, text, timestamptz, timestamptz, text, int, int
) from public;
grant execute on function public.crm_list_contacts_page(
  text, text, uuid, text, text, text, text, boolean, boolean, boolean, boolean,
  text, uuid, text, timestamptz, timestamptz, text, int, int
) to authenticated;

-- Быстрые счётчики по источнику + уникальные каналы/сегменты для фильтров.
create or replace function public.crm_contacts_meta()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_all bigint;
  v_site bigint;
  v_tg bigint;
  v_unknown bigint;
  v_channels jsonb;
  v_segments jsonb;
begin
  if not public.crm_has_staff_access(auth.uid()) then
    return jsonb_build_object(
      'quick_counts', jsonb_build_object('all', 0, 'site', 0, 'telegram', 0, 'unknown', 0),
      'channels', '[]'::jsonb,
      'segments', '[]'::jsonb
    );
  end if;

  select count(*) into v_all from public.crm_contacts;

  select count(*) into v_site
  from public.crm_contacts c
  where trim(coalesce(c.source_channel, '')) in ('site', 'site_form', 'site_quiz');

  select count(*) into v_tg
  from public.crm_contacts c
  where c.telegram_id is not null or trim(coalesce(c.source_channel, '')) = 'telegram_bot';

  select count(*) into v_unknown
  from public.crm_contacts c
  where trim(coalesce(c.source_channel, '')) = '' or trim(coalesce(c.source_channel, '')) = 'unknown';

  select coalesce(jsonb_agg(ch order by ch), '[]'::jsonb)
  into v_channels
  from (
    select distinct trim(coalesce(source_channel, '')) as ch
    from public.crm_contacts
    where trim(coalesce(source_channel, '')) <> ''
  ) s;

  select coalesce(jsonb_agg(seg order by seg), '[]'::jsonb)
  into v_segments
  from (
    select distinct trim(segment) as seg
    from public.crm_contacts
    where segment is not null and trim(segment) <> ''
  ) s2;

  return jsonb_build_object(
    'quick_counts', jsonb_build_object(
      'all', v_all,
      'site', v_site,
      'telegram', v_tg,
      'unknown', v_unknown
    ),
    'channels', v_channels,
    'segments', v_segments
  );
end;
$$;

revoke all on function public.crm_contacts_meta() from public;
grant execute on function public.crm_contacts_meta() to authenticated;

-- Агрегаты дашборда: воронка, конверсия между соседними этапами, топ каналов, SLA-прокси, тренд 7 дней.
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
  v_conversion jsonb;
  v_sources jsonb;
  v_sla jsonb;
  v_trend jsonb;
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
  ),
  conv as (
    select
      code,
      name,
      sort_order,
      cnt,
      lag(cnt) over (order by sort_order) as prev_cnt
    from counts
  )
  select
    coalesce(
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
    ),
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'code', code,
            'name', name,
            'sort_order', sort_order,
            'count', cnt,
            'pct_of_previous',
            case
              when prev_cnt is null or prev_cnt = 0 then null
              else round((100.0 * cnt::numeric / prev_cnt::numeric)::numeric, 1)
            end
          )
          order by sort_order
        )
        from conv
      ),
      '[]'::jsonb
    )
  into v_funnel, v_conversion;

  select
    coalesce(
      jsonb_agg(
        jsonb_build_object('channel', ch, 'count', n)
        order by n desc, ch
      ),
      '[]'::jsonb
    )
  into v_sources
  from (
    select
      case
        when trim(coalesce(source_channel, '')) = '' then '(пусто)'
        else trim(coalesce(source_channel, ''))
      end as ch,
      count(*)::bigint as n
    from public.crm_contacts
    group by 1
    order by n desc, ch
    limit 24
  ) t;

  -- SLA-прокси: среди лидов за 30 дней с известной last_activity — доля с реакцией ≤ 24 ч.
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
    'stage_conversion', v_conversion,
    'top_source_channels', v_sources,
    'sla_first_activity', v_sla,
    'new_per_day_utc_7d', v_trend
  );
end;
$$;

revoke all on function public.crm_dashboard_metrics() from public;
grant execute on function public.crm_dashboard_metrics() to authenticated;

commit;
