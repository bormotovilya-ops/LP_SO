-- Флаг «подарок получен» для фильтра в списке и карточке; синхронизируется webhook при выдаче в боте.

ALTER TABLE public.crm_contacts
  ADD COLUMN IF NOT EXISTS gift_received boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.crm_contacts.gift_received IS 'Пользователь забрал медитацию-подарок в Telegram (сценарий present).';

-- Исторические данные: хотя бы одна интеракция gift_received
UPDATE public.crm_contacts c
   SET gift_received = true
 WHERE c.gift_received = false
   AND EXISTS (
     SELECT 1
       FROM public.crm_interactions i
      WHERE i.contact_id = c.id
        AND i.interaction_type = 'gift_received'
   );

DROP FUNCTION IF EXISTS public.crm_list_contacts_page(
  text,
  text,
  uuid,
  text,
  text,
  text,
  text,
  boolean,
  boolean,
  boolean,
  boolean,
  text,
  uuid,
  text,
  timestamptz,
  timestamptz,
  text,
  int,
  int
);

CREATE OR REPLACE FUNCTION public.crm_list_contacts_page(
  p_quick_source text DEFAULT 'all',
  p_exact_channel text DEFAULT NULL,
  p_stage_id uuid DEFAULT NULL,
  p_temperature text DEFAULT NULL,
  p_duplicate_filter text DEFAULT 'any',
  p_segment_exact text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_require_telegram boolean DEFAULT false,
  p_require_phone boolean DEFAULT false,
  p_require_email boolean DEFAULT false,
  p_consent_only boolean DEFAULT false,
  p_owner_filter text DEFAULT 'any',
  p_my_user_id uuid DEFAULT NULL,
  p_next_action_preset text DEFAULT 'any',
  p_na_day_start timestamptz DEFAULT NULL,
  p_na_day_end timestamptz DEFAULT NULL,
  p_sort text DEFAULT 'activity',
  p_limit int DEFAULT 25,
  p_offset int DEFAULT 0,
  p_gift_received_filter text DEFAULT 'any'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
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
  v_gift text := lower(trim(coalesce(p_gift_received_filter, 'any')));
  v_total bigint := 0;
  v_rows jsonb := '[]'::jsonb;
BEGIN
  IF NOT public.crm_has_staff_access(auth.uid()) THEN
    RETURN jsonb_build_object('rows', '[]'::jsonb, 'total', 0);
  END IF;

  IF v_quick = 'telegram' THEN
    v_quick := 'bot';
  ELSIF v_quick = 'unknown' THEN
    v_quick := 'other';
  END IF;

  IF v_gift NOT IN ('any', 'yes', 'no') THEN
    v_gift := 'any';
  END IF;

  WITH base AS (
    SELECT c.*
      FROM public.crm_contacts c
     WHERE true
       AND (
         v_exact_channel IS NULL
         OR trim(coalesce(c.source_channel, '')) = v_exact_channel
       )
       AND (
         v_exact_channel IS NOT NULL
         OR v_quick = 'all'
         OR (v_quick = 'crm' AND trim(coalesce(c.source_channel, '')) = 'crm')
         OR (v_quick = 'bot' AND trim(coalesce(c.source_channel, '')) = 'bot')
         OR (v_quick = 'site' AND trim(coalesce(c.source_channel, '')) = 'site')
         OR (v_quick = 'channel' AND trim(coalesce(c.source_channel, '')) = 'channel')
         OR (v_quick = 'vk' AND trim(coalesce(c.source_channel, '')) = 'vk')
         OR (v_quick = 'instagram' AND trim(coalesce(c.source_channel, '')) = 'instagram')
         OR (v_quick = 'other' AND trim(coalesce(c.source_channel, '')) = 'other')
       )
       AND (p_stage_id IS NULL OR c.current_stage_id = p_stage_id)
       AND (
         p_temperature IS NULL
         OR trim(p_temperature) = ''
         OR coalesce(nullif(trim(c.lead_temperature), ''), 'cold') = trim(p_temperature)
       )
       AND (
         v_dup = 'any'
         OR (v_dup = 'only' AND c.is_duplicate = true)
         OR (v_dup = 'hide' AND coalesce(c.is_duplicate, false) = false)
       )
       AND (v_segment_exact IS NULL OR trim(coalesce(c.segment, '')) = v_segment_exact)
       AND (NOT p_require_telegram OR c.telegram_id IS NOT NULL)
       AND (NOT p_require_phone OR (c.phone IS NOT NULL AND trim(c.phone) <> ''))
       AND (NOT p_require_email OR (c.email IS NOT NULL AND trim(c.email) <> ''))
       AND (NOT p_consent_only OR c.consent_personal_data = true)
       AND (
         v_gift = 'any'
         OR (v_gift = 'yes' AND c.gift_received = true)
         OR (v_gift = 'no' AND c.gift_received = false)
       )
       AND (
         v_owner = 'any'
         OR (v_owner = 'mine' AND p_my_user_id IS NOT NULL AND c.owner_user_id = p_my_user_id)
         OR (v_owner = 'unassigned' AND c.owner_user_id IS NULL)
       )
       AND (
         v_na = 'any'
         OR (v_na = 'scheduled' AND c.next_action_at IS NOT NULL)
         OR (v_na = 'overdue' AND c.next_action_at IS NOT NULL AND c.next_action_at < timezone('utc', now()))
         OR (
           v_na = 'today'
           AND c.next_action_at IS NOT NULL
           AND p_na_day_start IS NOT NULL
           AND p_na_day_end IS NOT NULL
           AND c.next_action_at >= p_na_day_start
           AND c.next_action_at <= p_na_day_end
         )
       )
       AND (
         v_search IS NULL
         OR lower(concat_ws(
           ' ',
           coalesce(c.full_name, ''),
           coalesce(c.email, ''),
           coalesce(c.phone, ''),
           coalesce(c.source_detail, ''),
           coalesce(c.segment, ''),
           coalesce(c.utm_source, ''),
           coalesce(c.utm_campaign, '')
         )) LIKE '%' || v_search || '%'
       )
  )
  SELECT
    (SELECT count(*)::bigint FROM base),
    COALESCE(
      (
        SELECT jsonb_agg(to_jsonb(t.*))
          FROM (
            SELECT *
              FROM base b
             ORDER BY
               CASE WHEN v_sort = 'created' THEN b.created_at END DESC NULLS LAST,
               CASE WHEN v_sort = 'next_action' THEN b.next_action_at END ASC NULLS LAST,
               CASE WHEN v_sort = 'activity' THEN b.last_activity_at END DESC NULLS LAST,
               CASE WHEN v_sort = 'activity' THEN b.created_at END DESC NULLS LAST,
               b.id ASC
             LIMIT v_lim OFFSET v_off
          ) t
      ),
      '[]'::jsonb
    )
  INTO v_total, v_rows;

  RETURN jsonb_build_object('rows', COALESCE(v_rows, '[]'::jsonb), 'total', COALESCE(v_total, 0));
END;
$$;

REVOKE ALL ON FUNCTION public.crm_list_contacts_page(
  text,
  text,
  uuid,
  text,
  text,
  text,
  text,
  boolean,
  boolean,
  boolean,
  boolean,
  text,
  uuid,
  text,
  timestamptz,
  timestamptz,
  text,
  int,
  int,
  text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_list_contacts_page(
  text,
  text,
  uuid,
  text,
  text,
  text,
  text,
  boolean,
  boolean,
  boolean,
  boolean,
  text,
  uuid,
  text,
  timestamptz,
  timestamptz,
  text,
  int,
  int,
  text
) TO authenticated;
