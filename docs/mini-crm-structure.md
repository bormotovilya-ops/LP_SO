# Mini-CRM: структура, логика и поэтапная реализация

## 1. Назначение

Mini-CRM нужна для управления лидами без абонентской платы на внешнюю CRM, с сохранением возможности перейти в AmoCRM/другую систему в будущем.

Система строится вокруг текущего стека:

- сайт;
- Telegram-бот;
- Supabase (Postgres + Edge Functions + Auth + RLS).

## 2. Бизнес-объекты

### `crm_contacts`

Карточка лида:

- контактные данные;
- источник (канал + детализация + UTM);
- текущий этап воронки;
- ответственный менеджер;
- признаки активности и следующий шаг.

### `crm_pipeline_stages`

Справочник этапов воронки:

- `new_lead` -> `qualified` -> `contacted` -> `offer_sent` -> `payment_pending` -> `won/lost`.

### `crm_contact_stage_history`

Журнал всех переходов между этапами:

- откуда/куда;
- кто изменил (`manager`, `bot`, `system`);
- причина и комментарий.

### `crm_interactions`

Все взаимодействия с лидом:

- сообщения бота;
- ручные заметки;
- звонки/касания;
- payload в `jsonb`.

### `crm_tasks`

Операционные задачи менеджеру:

- приоритет;
- дедлайн;
- статус исполнения.

### `crm_products` + `crm_orders`

Продукты и сделки/оплаты:

- что продаем;
- сумма и статус оплаты;
- внешний `external_order_id` для провайдеров платежей.

### `crm_bot_sessions`

Состояние диалоговой сессии бота:

- текущий intent/step;
- последняя активность.

### `crm_outbox_events`

Очередь исходящих событий из CRM к боту:

- событие;
- payload;
- ретраи и статус доставки.

### `crm_profiles`

Роли и права команды:

- `admin`, `manager`, `viewer`.

## 3. Связи между сущностями

- `crm_contacts` 1->N `crm_interactions`
- `crm_contacts` 1->N `crm_contact_stage_history`
- `crm_contacts` 1->N `crm_tasks`
- `crm_contacts` 1->N `crm_orders`
- `crm_pipeline_stages` 1->N `crm_contacts` (текущий этап)
- `crm_pipeline_stages` 1->N `crm_contact_stage_history` (история переходов)

## 4. Ключевая бизнес-логика

## 4.1 Создание/обновление лида (upsert)

Реализовано через SQL-функцию `crm_upsert_contact`:

1. Нормализация телефона.
2. Поиск дубля по `phone | email | telegram_id`.
3. Если дубль не найден:
   - создается новый контакт;
   - назначается стартовый этап `new_lead`;
   - пишется запись в `crm_contact_stage_history`.
4. Если найден:
   - обновляются непустые поля;
   - обновляется `last_activity_at`.

## 4.2 Перевод лида по воронке

Реализовано функцией `crm_change_stage`:

- валидация целевого этапа;
- обновление `current_stage_id`;
- запись в журнал переходов;
- фиксация `changed_by` и `reason`.

## 4.3 Запись касаний

Реализовано функцией `crm_add_interaction`:

- сохраняет interaction;
- обновляет `last_activity_at` у контакта.

## 4.4 Интеграция с ботом

Добавлена edge-функция `crm-bot-event`:

- получает событие от бота;
- создает/обновляет контакт;
- пишет interaction;
- при необходимости переводит этап (по `stageCode`).

## 4.5 Интеграция с сайтом/квизом/формой

Добавлена edge-функция `crm-lead-upsert`:

- принимает лид из формы;
- вызывает `crm_upsert_contact`;
- опционально пишет первичный interaction.

## 5. RLS и безопасность

Для всех CRM-таблиц включен RLS:

- админ видит/управляет всем;
- менеджер работает со своими контактами и связанными сущностями;
- в справочниках чтение доступно авторизованным пользователям;
- критичные изменения ограничены политиками.

## 6. Что добавлено в проект

- SQL-миграции:
  - `supabase/migrations/20260426010000_mini_crm_core.sql`
  - `supabase/migrations/20260426011000_mini_crm_functions.sql`
  - `supabase/migrations/20260426220000_crm_rls_staff_access.sql` — RLS для ролей `admin` / `manager` / `viewer` (просмотр/редактирование через веб-CRM; первичное назначение `admin` для `bormotovilya@gmail.com` при наличии пользователя в `auth.users`)
- Edge-функции:
  - `supabase/functions/crm-lead-upsert/index.ts`
  - `supabase/functions/crm-bot-event/index.ts`
- Конфиг функций:
  - обновлен `supabase/config.toml`
- Скрипты запуска и проверки:
  - `scripts/crm/01_apply_migrations.ps1`
  - `scripts/crm/02_seed_demo_data.sql`
  - `scripts/crm/03_smoke_checks.sql`
  - `scripts/crm/README.md`

## 7. Пошаговый план внедрения (практика)

1. Применить миграции (`01_apply_migrations.ps1`).
2. Убедиться, что в `crm_pipeline_stages` появились этапы.
3. Секреты Edge Functions: `SUPABASE_URL` и `SUPABASE_SERVICE_ROLE_KEY` **задаёт платформа** (системные), руками через `supabase secrets set` их обычно не добавляют. Для веб-CRM в `.env` фронтенда нужны **`VITE_SUPABASE_URL`** и **`VITE_SUPABASE_ANON_KEY`** (публичный anon из Dashboard → API).
4. Деплой edge-функций:
   - `npx supabase functions deploy crm-lead-upsert`
   - `npx supabase functions deploy crm-bot-event`
5. Подключить сайт к `crm-lead-upsert`.
6. Подключить бота к `crm-bot-event`.
7. Опционально залить демо-данные (`02_seed_demo_data.sql`).
8. Выполнить `03_smoke_checks.sql`.
9. Поднять веб-CRM на сайте: переменные `VITE_SUPABASE_*`, вход в `#/admin/login`, рабочий стол `#/admin/crm`.

## 8. Веб-интерфейс CRM (реализовано)

Маршруты (сайт на `HashRouter`, в адресе с `#`):

- `#/admin/login` — email/password через Supabase Auth;
- `#/admin/crm` — дашборд (KPI, столбчатая воронка по этапам, линия «новых лидов» за 7 дней);
- `#/admin/crm/contacts` — таблица лидов;
- `#/admin/crm/contacts/:id` — карточка: этап (RPC `crm_change_stage`), ответственный, поля контакта, `next_action_at`, комментарий.

Доступ:

- в шапке главной: **ключ** — вход / переход в CRM (приглушённый стиль, без пункта в меню);
- **карандаш** — только `admin` и `manager` в `crm_profiles`, переключает локальный редактор текстов (как раньше у ключа);
- `viewer` видит CRM в режиме **только чтения** (кнопка «Сохранить» скрыта).

RLS (миграция `20260426220000_crm_rls_staff_access.sql`):

- `viewer` — чтение сущностей CRM, без записи;
- `manager` и `admin` — полное чтение/запись лидов и связанных сущностей;
- `crm_products` пишет по-прежнему только `admin`;
- `crm_outbox_events` — только `admin`.

## 9. Что делать следующим этапом

- Реализовать правила автонапоминаний через cron + `crm_outbox_events`.
- Расширить отчёты в дашборде:
  - источники лидов;
  - SLA первого контакта;
  - выручка по продуктам/каналам;
  - таймлайн `crm_interactions` в карточке лида.
- При необходимости — code-splitting для уменьшения бандла (CRM+charts).
