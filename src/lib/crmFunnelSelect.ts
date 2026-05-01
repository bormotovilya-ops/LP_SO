/** Значение для Radix Select: пустое value и несовпадение с пунктами списка ломают рендер. */
export const CRM_FUNNEL_SELECT_UNRESOLVED_SENTINEL = "__crm_stage_unresolved__" as const;

export function resolveCrmFunnelSelectValue(
  stageCode: string,
  stageCodes: ReadonlySet<string>,
): string | typeof CRM_FUNNEL_SELECT_UNRESOLVED_SENTINEL {
  return stageCode && stageCodes.has(stageCode) ? stageCode : CRM_FUNNEL_SELECT_UNRESOLVED_SENTINEL;
}
