begin;

-- Списки по контакту и отчёты по этапу: дополнительные покрывающие индексы (FK уже есть).
create index if not exists crm_contact_stage_history_to_stage_idx on public.crm_contact_stage_history(to_stage_id);
create index if not exists crm_contact_stage_history_from_stage_idx on public.crm_contact_stage_history(from_stage_id)
  where from_stage_id is not null;

create index if not exists crm_tasks_contact_idx on public.crm_tasks(contact_id, created_at desc);

comment on table public.crm_pipeline_stages is 'Справочник этапов воронки (code уникален; sort_order уникален глобально).';
comment on table public.crm_contacts is 'Лиды CRM: текущий этап — current_stage_id → crm_pipeline_stages.';
comment on table public.crm_contact_stage_history is 'Журнал переходов контакта между этапами.';

commit;
