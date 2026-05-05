-- Одноразовый бэкофил: заполнить public.crm_contacts.telegram_username из истории
-- public.crm_interactions (payload jsonb), только там где сейчас пусто.
--
-- Источники в payload (как на сайте / в edge-функциях):
--   telegram, messenger, telegram_handle, telegram_username,
--   metadata.telegram_username (вложенный ключ у части событий).
-- Дополнительно: подстрока вида t.me/username или @username в произвольном тексте.
--
-- Использование (Supabase SQL Editor):
--   1) Сначала PREVIEW (секция ниже) — проверить строки.
--   2) Затем раскомментировать BEGIN/COMMIT и выполнить UPDATE в транзакции.
--
-- Требования: PostgreSQL с regex (lookahead не используем — совместимость).

-- ---------------------------------------------------------------------------
-- Вспомогательные функции (можно оставить в БД или удалить после прогона).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.crm_try_parse_telegram_username(p_raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  t text := nullif(trim(coalesce(p_raw, '')), '');
  m text[];
  u text;
BEGIN
  IF t IS NULL THEN
    RETURN NULL;
  END IF;

  t := lower(t);

  -- t.me/username
  m := regexp_match(t, 't\.me/([a-z][a-z0-9_]{4,31})(?:[\?#/]|$)');
  IF m IS NOT NULL AND m[1] IS NOT NULL THEN
    RETURN m[1];
  END IF;

  -- Явный @username (не сливается с дальнейшими буквами/цифрами/_)
  m := regexp_match(t, '@([a-z][a-z0-9_]{4,31})([^a-z0-9_]|$)');
  IF m IS NOT NULL AND m[1] IS NOT NULL THEN
    RETURN m[1];
  END IF;

  -- Вся строка — ник (с опциональным ведущим @)
  u := trim(both '@' from t);
  IF u ~ '^[a-z][a-z0-9_]{4,31}$' THEN
    RETURN u;
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_parse_telegram_username_from_payload(p jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  el text;
  cand text;
  meta_u text;
  chunks text[];
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'object' THEN
    RETURN NULL;
  END IF;

  meta_u := nullif(trim(p #>> '{metadata,telegram_username}'), '');
  chunks := ARRAY[
    p ->> 'telegram',
    p ->> 'messenger',
    p ->> 'telegram_handle',
    p ->> 'telegram_username',
    meta_u
  ];

  FOREACH el IN ARRAY chunks
  LOOP
    CONTINUE WHEN el IS NULL OR btrim(el) = '';
    cand := public.crm_try_parse_telegram_username(el);
    IF cand IS NOT NULL THEN
      RETURN cand;
    END IF;
  END LOOP;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.crm_try_parse_telegram_username(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.crm_parse_telegram_username_from_payload(jsonb) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- PREVIEW: сколько строк затронет обновление и примеры (без записи).
-- ---------------------------------------------------------------------------

/*
SELECT
  count(*)::bigint AS contacts_to_update
FROM public.crm_contacts c
WHERE (c.telegram_username IS NULL OR btrim(c.telegram_username) = '')
  AND EXISTS (
    SELECT 1
    FROM public.crm_interactions i
    WHERE i.contact_id = c.id
      AND public.crm_parse_telegram_username_from_payload(i.payload) IS NOT NULL
  );
*/

/*
SELECT
  c.id,
  c.full_name,
  c.phone,
  c.telegram_username AS current_username,
  f.picked_username,
  f.picked_at
FROM public.crm_contacts c
JOIN LATERAL (
  SELECT
    public.crm_parse_telegram_username_from_payload(i.payload) AS picked_username,
    i.created_at AS picked_at
  FROM public.crm_interactions i
  WHERE i.contact_id = c.id
    AND public.crm_parse_telegram_username_from_payload(i.payload) IS NOT NULL
  ORDER BY i.created_at ASC
  LIMIT 1
) f ON true
WHERE (c.telegram_username IS NULL OR btrim(c.telegram_username) = '')
ORDER BY f.picked_at ASC
LIMIT 200;
*/

-- ---------------------------------------------------------------------------
-- UPDATE (выполнить вручную; при желании обернуть в BEGIN; … COMMIT;)
-- ---------------------------------------------------------------------------

/*
BEGIN;

WITH first_username AS (
  SELECT DISTINCT ON (p.contact_id)
    p.contact_id,
    p.u AS username
  FROM (
    SELECT
      i.contact_id,
      public.crm_parse_telegram_username_from_payload(i.payload) AS u,
      i.created_at
    FROM public.crm_interactions i
  ) p
  WHERE p.u IS NOT NULL
  ORDER BY p.contact_id, p.created_at ASC
)
UPDATE public.crm_contacts c
SET telegram_username = f.username
FROM first_username f
WHERE c.id = f.contact_id
  AND (c.telegram_username IS NULL OR btrim(c.telegram_username) = '');

COMMIT;
*/

-- ---------------------------------------------------------------------------
-- После прогона — по желанию удалить функции:
-- ---------------------------------------------------------------------------

-- DROP FUNCTION IF EXISTS public.crm_parse_telegram_username_from_payload(jsonb);
-- DROP FUNCTION IF EXISTS public.crm_try_parse_telegram_username(text);
