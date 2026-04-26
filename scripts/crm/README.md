# CRM scripts

Папка содержит набор скриптов для запуска mini-CRM в Supabase.

## Что внутри

- `01_apply_migrations.ps1` — применяет все SQL-миграции из `supabase/migrations`.
- `02_seed_demo_data.sql` — опциональный сид с демонстрационными лидами и задачами.
- `03_smoke_checks.sql` — базовые проверки после развертывания.

## Быстрый запуск

1. Убедитесь, что Supabase CLI установлен и проект связан с удаленной базой:
   - `npx supabase login`
   - `npx supabase link --project-ref <project-ref>`
2. Выполните:
   - `powershell -ExecutionPolicy Bypass -File .\scripts\crm\01_apply_migrations.ps1`
3. Опционально:
   - `npx supabase db remote commit` (если хотите синхронизировать состояние после ручных SQL)
   - применить сид: `psql "<REMOTE_DB_URL>" -f .\scripts\crm\02_seed_demo_data.sql`

## Важно

Edge-функции `crm-lead-upsert` и `crm-bot-event` используют:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Добавьте их в secrets:

- `npx supabase secrets set SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=...`
