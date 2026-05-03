-- Телефон с анкеты квиза: подставляется в crm_upsert_contact при /start в боте, чтобы не плодить второй контакт только с telegram_id.

ALTER TABLE public.crm_bot_start_attribution
  ADD COLUMN IF NOT EXISTS phone text;

COMMENT ON COLUMN public.crm_bot_start_attribution.phone IS 'Подставляется перед открытием бота; crm_normalize_phone в crm_upsert_contact.';

