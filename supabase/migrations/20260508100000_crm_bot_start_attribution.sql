-- Одноразовые токены для передачи UTM с сайта (квиз) в CRM при /start в Telegram.
-- Таблица доступна только через service_role (Edge Functions); RLS без политик — anon/auth не читают.

CREATE TABLE IF NOT EXISTS public.crm_bot_start_attribution (
  token text PRIMARY KEY
    CHECK (token ~ '^[a-f0-9]{12}$'),
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_bot_start_attribution_created_at_idx
  ON public.crm_bot_start_attribution (created_at);

ALTER TABLE public.crm_bot_start_attribution ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.crm_bot_start_attribution IS 'UTM с лендинга/квиза для записи в CRM при первом /start бота; строка удаляется после использования webhook.';
