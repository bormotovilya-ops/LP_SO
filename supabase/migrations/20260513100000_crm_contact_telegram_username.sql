-- Публичный @username Telegram (без @) для ссылок t.me; при апсерте из бота подставляется из from.username.

ALTER TABLE public.crm_contacts
  ADD COLUMN IF NOT EXISTS telegram_username text;

COMMENT ON COLUMN public.crm_contacts.telegram_username IS
  'Username Telegram без @ (a–z, 0–9, _), 5–32 символа; обновляется при crm_upsert_contact из бота, если передан.';

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
  text,
  uuid
);

CREATE OR REPLACE FUNCTION public.crm_upsert_contact(
  p_full_name text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_telegram_id bigint DEFAULT NULL,
  p_telegram_username text DEFAULT NULL,
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
  v_email text := CASE
    WHEN p_email IS NOT NULL AND trim(p_email) <> '' THEN lower(trim(p_email))
    ELSE NULL
  END;
  v_tg_user text;
  v_candidate_ids uuid[];
  v_nc int := 0;
  v_keep_id uuid;
  v_contact public.crm_contacts;
  v_new_stage_id uuid;
  v_source_channel text := coalesce(nullif(trim(p_source_channel), ''), 'other');
  r public.crm_contacts%ROWTYPE;
BEGIN
  v_tg_user := null;
  IF p_telegram_username IS NOT NULL AND trim(p_telegram_username) <> '' THEN
    v_tg_user := lower(trim(both '@' from trim(p_telegram_username)));
    IF v_tg_user !~ '^[a-z][a-z0-9_]{4,31}$' THEN
      v_tg_user := null;
    END IF;
  END IF;

  SELECT COALESCE(
    ARRAY(
      SELECT c.id
        FROM public.crm_contacts c
       WHERE (p_resolve_contact_id IS NOT NULL AND c.id = p_resolve_contact_id)
          OR (v_phone IS NOT NULL AND c.phone = v_phone)
          OR (v_email IS NOT NULL AND c.email = v_email)
          OR (p_telegram_id IS NOT NULL AND c.telegram_id = p_telegram_id)
       ORDER BY c.created_at ASC, c.id ASC
    ),
    ARRAY[]::uuid[]
  )
  INTO v_candidate_ids;

  IF v_candidate_ids IS NULL OR cardinality(v_candidate_ids) IS NULL THEN
    v_nc := 0;
  ELSE
    v_nc := cardinality(v_candidate_ids);
  END IF;

  IF v_nc > 1 THEN
    v_keep_id := NULL;
    IF p_telegram_id IS NOT NULL THEN
      SELECT c.id
        INTO v_keep_id
        FROM public.crm_contacts c
       WHERE c.id = ANY (v_candidate_ids)
         AND c.telegram_id = p_telegram_id
       ORDER BY c.created_at ASC, c.id ASC
       LIMIT 1;
    END IF;
    IF v_keep_id IS NULL
       AND p_resolve_contact_id IS NOT NULL
       AND p_resolve_contact_id = ANY (v_candidate_ids)
    THEN
      v_keep_id := p_resolve_contact_id;
    END IF;
    IF v_keep_id IS NULL THEN
      v_keep_id := v_candidate_ids[1];
    END IF;

    FOR r IN
      SELECT *
        FROM public.crm_contacts c
       WHERE c.id = ANY(v_candidate_ids)
       ORDER BY c.created_at ASC, c.id ASC
    LOOP
      IF r.id = v_keep_id THEN
        CONTINUE;
      END IF;
        UPDATE public.crm_contacts k
           SET full_name = CASE
                 WHEN k.telegram_id IS NOT NULL AND r.telegram_id IS NULL
                   THEN nullif(trim(k.full_name), '')
                 ELSE COALESCE(nullif(trim(k.full_name), ''), nullif(trim(r.full_name), ''))
               END,
               phone = CASE
                 WHEN k.telegram_id IS NOT NULL AND r.telegram_id IS NULL THEN k.phone
                 ELSE coalesce(k.phone, r.phone)
               END,
               email = CASE
                 WHEN k.telegram_id IS NOT NULL AND r.telegram_id IS NULL THEN
                   nullif(lower(trim(coalesce(k.email, ''))), '')
                 ELSE COALESCE(
                   nullif(lower(trim(coalesce(k.email, ''))), ''),
                   nullif(lower(trim(coalesce(r.email, ''))), '')
                 )
               END,
               telegram_id = coalesce(k.telegram_id, r.telegram_id),
               telegram_username = COALESCE(
                 nullif(trim(k.telegram_username), ''),
                 nullif(trim(r.telegram_username), '')
               ),
               whatsapp_id = COALESCE(nullif(trim(k.whatsapp_id), ''), nullif(trim(r.whatsapp_id), '')),
               vk_id = COALESCE(nullif(trim(k.vk_id), ''), nullif(trim(r.vk_id), '')),
               source_detail = COALESCE(nullif(trim(k.source_detail), ''), nullif(trim(r.source_detail), '')),
               utm_source = COALESCE(nullif(trim(k.utm_source), ''), nullif(trim(r.utm_source), '')),
               utm_medium = COALESCE(nullif(trim(k.utm_medium), ''), nullif(trim(r.utm_medium), '')),
               utm_campaign = COALESCE(nullif(trim(k.utm_campaign), ''), nullif(trim(r.utm_campaign), '')),
               utm_content = COALESCE(nullif(trim(k.utm_content), ''), nullif(trim(r.utm_content), '')),
               utm_term = COALESCE(nullif(trim(k.utm_term), ''), nullif(trim(r.utm_term), '')),
               segment = COALESCE(nullif(trim(k.segment), ''), nullif(trim(r.segment), '')),
               lead_temperature = CASE
                 WHEN k.lead_temperature = 'hot' OR r.lead_temperature = 'hot' THEN 'hot'::text
                 WHEN k.lead_temperature = 'warm' OR r.lead_temperature = 'warm' THEN 'warm'::text
                 ELSE 'cold'::text
               END,
               owner_user_id = coalesce(k.owner_user_id, r.owner_user_id),
               is_duplicate = k.is_duplicate OR r.is_duplicate,
               consent_personal_data = k.consent_personal_data OR r.consent_personal_data,
               gift_received = COALESCE(k.gift_received, false) OR COALESCE(r.gift_received, false),
               next_action_at = CASE
                 WHEN k.next_action_at IS NULL THEN r.next_action_at
                 WHEN r.next_action_at IS NULL THEN k.next_action_at
                 WHEN k.next_action_at < r.next_action_at THEN k.next_action_at
                 ELSE r.next_action_at
               END,
               last_activity_at = CASE
                 WHEN k.last_activity_at IS NULL THEN r.last_activity_at
                 WHEN r.last_activity_at IS NULL THEN k.last_activity_at
                 WHEN k.last_activity_at < r.last_activity_at THEN r.last_activity_at
                 ELSE k.last_activity_at
               END,
               comment = CASE
                 WHEN length(trim(coalesce(r.comment, ''))) > length(trim(coalesce(k.comment, '')))
                   THEN nullif(trim(r.comment), '')
                 ELSE nullif(trim(k.comment), '')
               END
         WHERE k.id = v_keep_id;

        UPDATE public.crm_orders o
           SET contact_id = v_keep_id
         WHERE o.contact_id = r.id;

        UPDATE public.crm_interactions z
           SET contact_id = v_keep_id
         WHERE z.contact_id = r.id;

        UPDATE public.crm_tasks t
           SET contact_id = v_keep_id
         WHERE t.contact_id = r.id;

        UPDATE public.crm_contact_stage_history h
           SET contact_id = v_keep_id
         WHERE h.contact_id = r.id;

        DELETE FROM public.crm_bot_sessions bs
         WHERE bs.contact_id = r.id
           AND EXISTS (
             SELECT 1
               FROM public.crm_bot_sessions k
              WHERE k.contact_id = v_keep_id
                AND k.bot_platform = bs.bot_platform
           );

        UPDATE public.crm_bot_sessions s
           SET contact_id = v_keep_id
         WHERE s.contact_id = r.id;

        UPDATE public.crm_bot_start_attribution a
           SET contact_id = v_keep_id
         WHERE a.contact_id = r.id;

        DELETE FROM public.crm_contacts c WHERE c.id = r.id;
    END LOOP;

    SELECT * INTO STRICT v_contact FROM public.crm_contacts c WHERE c.id = v_keep_id LIMIT 1;
  ELSIF v_nc = 1 THEN
    SELECT *
      INTO v_contact
      FROM public.crm_contacts c
     WHERE c.id = v_candidate_ids[1]
     LIMIT 1;
  ELSE
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
      telegram_username,
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
      v_email,
      p_telegram_id,
      v_tg_user,
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

    RETURN v_contact;
  END IF;

  UPDATE public.crm_contacts c
     SET full_name = CASE
           WHEN p_telegram_id IS NOT NULL THEN COALESCE(nullif(trim(c.full_name), ''), nullif(trim(p_full_name), ''))
           ELSE coalesce(nullif(trim(p_full_name), ''), c.full_name)
         END,
         phone = CASE
           WHEN p_telegram_id IS NOT NULL THEN coalesce(c.phone, v_phone)
           ELSE coalesce(v_phone, c.phone)
         END,
         email = CASE
           WHEN p_telegram_id IS NOT NULL THEN COALESCE(
             nullif(lower(trim(coalesce(c.email, ''))), ''),
             nullif(v_email, '')
           )
           ELSE COALESCE(nullif(v_email, ''), c.email)
         END,
         telegram_id = coalesce(p_telegram_id, c.telegram_id),
         telegram_username = CASE
           WHEN p_telegram_id IS NOT NULL AND v_tg_user IS NOT NULL THEN v_tg_user
           ELSE c.telegram_username
         END,
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

  RETURN v_contact;
END;
$$;

COMMENT ON FUNCTION public.crm_upsert_contact(
  text, text, text, bigint, text, text, text, text, text, text, text, text, text, uuid, boolean, text, uuid
) IS
  'Upsert лида по телефону / email / Telegram / resolve id; несколько совпадений сливает в один контакт. p_telegram_username — публичный ник без @ при вызове из бота.';

REVOKE ALL ON FUNCTION public.crm_upsert_contact(
  text, text, text, bigint, text, text, text, text, text, text, text, text, text, uuid, boolean, text, uuid
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_upsert_contact(
  text, text, text, bigint, text, text, text, text, text, text, text, text, text, uuid, boolean, text, uuid
) TO anon, authenticated, service_role;
