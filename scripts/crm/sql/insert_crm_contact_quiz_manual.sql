-- Ручная вставка лида из квиза: crm_contacts + crm_contact_stage_history + crm_interactions (опционально).
-- Запуск: Supabase Dashboard → SQL Editor → вставьте блок, поправьте значения между «=====», выполните.
--
-- Если email уже есть в таблице, сработает unique index crm_contacts_email_uq — смените email или удалите дубль.

BEGIN;

WITH st AS (
  SELECT id AS stage_id
  FROM public.crm_pipeline_stages
  WHERE code = 'new_lead'
    AND is_active = TRUE
  LIMIT 1
),
new_contact AS (
  INSERT INTO public.crm_contacts (
    full_name,
    phone,
    email,
    telegram_id,
    telegram_username,
    source_channel,
    source_detail,
    utm_source,
    utm_medium,
    utm_campaign,
    utm_content,
    utm_term,
    current_stage_id,
    lead_temperature,
    segment,
    consent_personal_data,
    last_activity_at,
    comment
    -- ========== Поля лида — меняйте здесь =====================================
  )
  SELECT
    NULL, -- full_name
    NULL, -- phone
    lower(trim('Luninskaya@yandex.ru')), -- email
    NULL::bigint, -- telegram_id
    NULL, -- telegram_username
    'site', -- source_channel (каноника: crm | bot | site | channel | vk | instagram | other)
    'quiz_result_shown_manual', -- source_detail
    'telegram',
    'social',
    'numerology_quiz',
    'post_may',
    NULL, -- utm_term
    st.stage_id,
    'cold', -- lead_temperature: cold | warm | hot
    'money', -- segment (ключ темы квиза и т.п.)
    TRUE, -- consent_personal_data
    timezone('utc', now()),
    NULL -- comment
    -- =======================================================================
  FROM st
  RETURNING id, current_stage_id
),
_hist AS (
  INSERT INTO public.crm_contact_stage_history (
    contact_id,
    from_stage_id,
    to_stage_id,
    changed_by,
    reason,
    note
  )
  SELECT
    nc.id,
    NULL,
    nc.current_stage_id,
    'system', -- changed_by: system | manager | bot
    'lead_created',
    'Ручная вставка через SQL Editor'
  FROM new_contact nc
  RETURNING 1
)
INSERT INTO public.crm_interactions (
  contact_id,
  channel,
  direction,
  interaction_type,
  payload
)
SELECT
  nc.id,
  'quiz_form',
  'inbound', -- inbound | outbound | internal
  'quiz_result_shown',
  -- ========== JSON ответов квиза — меняйте здесь =============================
  jsonb_build_object(
    'quiz_number', 5,
    'focus', 'money',
    'situation', 'start',
    'communication_channel', 'Почта',
    'account_link', 'Luninskaya@yandex.ru',
    'account_platform', 'unknown',
    'account_handle', NULL
  )
  -- =======================================================================
FROM new_contact nc;

COMMIT;

-- Если интеракция не нужна: удалите весь финальный INSERT ... SELECT ... FROM new_contact
-- и оставьте только _hist CTE, завершая запрос так:
--
-- INSERT INTO public.crm_contact_stage_history (...)
-- SELECT ... FROM new_contact nc;
--
-- COMMIT;
