-- Привязка лида из квиза к одноразовому токену бота: webhook при /start находит ту же строку crm_contacts
-- по UUID, даже если слияние по телефону промахнулось (дубликаты, гонка до attach_phone).

ALTER TABLE public.crm_bot_start_attribution
  ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES public.crm_contacts(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.crm_bot_start_attribution.contact_id IS 'ID контакта после crm-lead-upsert на квизе; crm_upsert_contact(p_resolve_contact_id ...) при /start.';

DROP FUNCTION IF EXISTS public.crm_upsert_contact(
  text,
  text,
  text,
  bigint,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  uuid,
  boolean,
  text
);

CREATE OR REPLACE FUNCTION public.crm_upsert_contact(
  p_full_name text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_telegram_id bigint DEFAULT NULL,
  p_source_channel text DEFAULT 'other',
  p_source_detail text DEFAULT NULL,
  p_utm_source text DEFAULT NULL,
  p_utm_medium text DEFAULT NULL,
  p_utm_campaign text DEFAULT NULL,
  p_utm_content text DEFAULT NULL,
  p_utm_term text DEFAULT NULL,
  p_segment text DEFAULT NULL,
  p_owner_user_id uuid DEFAULT NULL,
  p_consent_personal_data boolean DEFAULT false,
  p_comment text DEFAULT NULL,
  p_resolve_contact_id uuid DEFAULT NULL
)
RETURNS public.crm_contacts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone text := public.crm_normalize_phone(p_phone);
  v_contact public.crm_contacts;
  v_has_contact_row boolean := false;
  v_new_stage_id uuid;
  v_source_channel text := coalesce(nullif(trim(p_source_channel), ''), 'other');
BEGIN
  IF p_resolve_contact_id IS NOT NULL THEN
    SELECT *
      INTO v_contact
      FROM public.crm_contacts c
     WHERE c.id = p_resolve_contact_id
     LIMIT 1;
    IF FOUND THEN
      v_has_contact_row := TRUE;
    END IF;
  END IF;

  IF NOT v_has_contact_row THEN
    SELECT *
      INTO v_contact
      FROM public.crm_contacts c
     WHERE (v_phone IS NOT NULL AND c.phone = v_phone)
        OR (p_email IS NOT NULL AND p_email <> '' AND c.email = lower(trim(p_email)))
        OR (p_telegram_id IS NOT NULL AND c.telegram_id = p_telegram_id)
     ORDER BY c.created_at ASC
     LIMIT 1;
    IF FOUND THEN
      v_has_contact_row := TRUE;
    END IF;
  END IF;

  IF NOT v_has_contact_row THEN
    SELECT id
      INTO v_new_stage_id
      FROM public.crm_pipeline_stages
     WHERE code = 'new_lead'
       AND is_active = TRUE
     LIMIT 1;

    INSERT INTO public.crm_contacts (
      full_name,
      phone,
      email,
      telegram_id,
      source_channel,
      source_detail,
      utm_source,
      utm_medium,
      utm_campaign,
      utm_content,
      utm_term,
      current_stage_id,
      segment,
      owner_user_id,
      consent_personal_data,
      comment,
      last_activity_at
    )
    VALUES (
      nullif(trim(p_full_name), ''),
      v_phone,
      nullif(lower(trim(p_email)), ''),
      p_telegram_id,
      v_source_channel,
      nullif(trim(p_source_detail), ''),
      nullif(trim(p_utm_source), ''),
      nullif(trim(p_utm_medium), ''),
      nullif(trim(p_utm_campaign), ''),
      nullif(trim(p_utm_content), ''),
      nullif(trim(p_utm_term), ''),
      v_new_stage_id,
      nullif(trim(p_segment), ''),
      p_owner_user_id,
      coalesce(p_consent_personal_data, FALSE),
      nullif(trim(p_comment), ''),
      timezone('utc', NOW())
    )
    RETURNING * INTO v_contact;

    IF v_contact.current_stage_id IS NOT NULL THEN
      INSERT INTO public.crm_contact_stage_history (
        contact_id,
        from_stage_id,
        to_stage_id,
        changed_by,
        reason,
        note
      )
      VALUES (
        v_contact.id,
        NULL,
        v_contact.current_stage_id,
        'system',
        'lead_created',
        'Стартовый этап при создании лида'
      );
    END IF;
  ELSE
    UPDATE public.crm_contacts c
       SET
        full_name = coalesce(nullif(trim(p_full_name), ''), c.full_name),
        phone = coalesce(v_phone, c.phone),
        email = coalesce(nullif(lower(trim(p_email)), ''), c.email),
        telegram_id = coalesce(p_telegram_id, c.telegram_id),
        source_channel = coalesce(nullif(trim(p_source_channel), ''), c.source_channel),
        source_detail = coalesce(nullif(trim(p_source_detail), ''), c.source_detail),
        utm_source = coalesce(nullif(trim(p_utm_source), ''), c.utm_source),
        utm_medium = coalesce(nullif(trim(p_utm_medium), ''), c.utm_medium),
        utm_campaign = coalesce(nullif(trim(p_utm_campaign), ''), c.utm_campaign),
        utm_content = coalesce(nullif(trim(p_utm_content), ''), c.utm_content),
        utm_term = coalesce(nullif(trim(p_utm_term), ''), c.utm_term),
        segment = coalesce(nullif(trim(p_segment), ''), c.segment),
        owner_user_id = coalesce(p_owner_user_id, c.owner_user_id),
        consent_personal_data = c.consent_personal_data OR coalesce(p_consent_personal_data, FALSE),
        comment = coalesce(c.comment, nullif(trim(p_comment), '')),
        last_activity_at = timezone('utc', NOW())
     WHERE c.id = v_contact.id
    RETURNING * INTO v_contact;
  END IF;

  RETURN v_contact;
END;
$$;

REVOKE ALL ON FUNCTION public.crm_upsert_contact(
  text, text, text, bigint, text, text, text, text, text, text, text, text, uuid, boolean, text, uuid
) FROM public;
GRANT EXECUTE ON FUNCTION public.crm_upsert_contact(
  text, text, text, bigint, text, text, text, text, text, text, text, text, uuid, boolean, text, uuid
) TO anon, authenticated, service_role;
