import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import { getSupabase } from "@/lib/supabaseClient";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import type { CrmContactRow, CrmPipelineStageRow, CrmProfileRow, LeadTemperature } from "@/types/crm";
import {
  CRM_CONTACTS_ANY_VALUE as ANY_VALUE,
  type CrmContactsNextActionPreset,
  type CrmContactsOwnerFilter,
  type CrmContactsPageSize,
  type CrmContactsSortKey,
  type DuplicateFilter,
  type QuickSourcePreset,
  coercePageSize,
  loadCrmContactsFilters,
  saveCrmContactsFilters,
  summarizeCrmFilters,
} from "@/lib/crmContactsFiltersStorage";
import { CRM_LEAD_SOURCES, type CrmLeadSourceCode, crmLeadSourceLabel } from "@/lib/crmLeadSources";
import { format, parseISO, startOfDay, endOfDay } from "date-fns";
import { ru } from "date-fns/locale";

type ContactsMetaQuickCounts = {
  all: number;
  crm: number;
  bot: number;
  site: number;
  channel: number;
  vk: number;
  instagram: number;
  other: number;
};

type ContactsMetaPayload = {
  quick_counts?: Partial<ContactsMetaQuickCounts>;
  channels?: unknown;
  segments?: unknown;
};

function isCrmLeadSourceCode(x: string): x is CrmLeadSourceCode {
  return CRM_LEAD_SOURCES.some((s) => s.code === x);
}

type ContactsPageRpcRow = Record<string, unknown>;

function coerceStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string").sort((a, b) => a.localeCompare(b, "ru"));
}

function unwrapRpcJson(data: ContactsPageRpcRow | ContactsPageRpcRow[] | null): ContactsPageRpcRow | null {
  if (Array.isArray(data)) {
    const first = data[0];
    return first && typeof first === "object" ? first : null;
  }
  return data && typeof data === "object" ? data : null;
}

function readStoredState() {
  const s = typeof window !== "undefined" ? loadCrmContactsFilters() : null;
  const dq = s?.duplicateFilter;
  const duplicateOk: DuplicateFilter =
    dq === "only" || dq === "hide" || dq === "any" ? dq : "any";
  let temp: LeadTemperature | typeof ANY_VALUE = ANY_VALUE;
  if (
    s?.temperatureFilter === "warm" ||
    s?.temperatureFilter === "hot" ||
    s?.temperatureFilter === "cold"
  ) {
    temp = s.temperatureFilter;
  }

  let qs: QuickSourcePreset = "all";
  const rawQs = typeof s?.quickSource === "string" ? s.quickSource : null;
  if (rawQs === "telegram") qs = "bot";
  else if (rawQs === "unknown") qs = "other";
  else if (rawQs === "all") qs = "all";
  else if (rawQs && isCrmLeadSourceCode(rawQs)) qs = rawQs;

  const legacyExact =
    typeof (s as { exactChannel?: string })?.exactChannel === "string"
      ? (s as { exactChannel: string }).exactChannel.trim()
      : "";
  if (qs === "all" && legacyExact && legacyExact !== ANY_VALUE && isCrmLeadSourceCode(legacyExact)) {
    qs = legacyExact;
  }

  let ownerFilter: CrmContactsOwnerFilter = "any";
  if (s?.ownerFilter === "mine" || s?.ownerFilter === "unassigned" || s?.ownerFilter === "any") {
    ownerFilter = s.ownerFilter;
  }

  let requireGiftReceived = typeof (s as { requireGiftReceived?: unknown })?.requireGiftReceived === "boolean"
    ? (s as { requireGiftReceived: boolean }).requireGiftReceived
    : false;
  const legacyGift = (s as { giftReceivedFilter?: string })?.giftReceivedFilter;
  if (!requireGiftReceived && legacyGift === "yes") requireGiftReceived = true;

  let sortKey: CrmContactsSortKey = "activity";
  if (s?.sortKey === "next_action" || s?.sortKey === "created" || s?.sortKey === "activity") {
    sortKey = s.sortKey;
  }

  let nextActionPreset: CrmContactsNextActionPreset = "any";
  if (
    s?.nextActionPreset === "scheduled" ||
    s?.nextActionPreset === "overdue" ||
    s?.nextActionPreset === "today" ||
    s?.nextActionPreset === "any"
  ) {
    nextActionPreset = s.nextActionPreset;
  }

  return {
    filtersPanelOpen: s?.filtersPanelOpen === true,
    quickSource: qs,
    stageId: typeof s?.stageId === "string" ? s.stageId : ANY_VALUE,
    temperatureFilter: temp,
    duplicateFilter: duplicateOk,
    segmentExact: typeof s?.segmentExact === "string" ? s.segmentExact : ANY_VALUE,
    searchText: typeof s?.searchText === "string" ? s.searchText : "",
    requireTelegramId: Boolean(s?.requireTelegramId),
    requirePhone: Boolean(s?.requirePhone),
    requireEmail: Boolean(s?.requireEmail),
    consentYesOnly: Boolean(s?.consentYesOnly),
    requireGiftReceived,
    ownerFilter,
    sortKey,
    nextActionPreset,
    page: Math.max(1, parseInt(String(s?.page ?? "1"), 10) || 1),
    pageSize: coercePageSize(s?.pageSize),
  };
}

export default function CrmContacts() {
  const supabase = getSupabase();
  const { user, canWriteCrm } = useAuth();
  const myUserId = user?.id ?? null;
  /** Одноразовое чтение сохранённых фильтров (без парсинга JSON на каждом рендере). */
  const storedInitRef = useRef<ReturnType<typeof readStoredState> | null>(null);
  if (!storedInitRef.current) storedInitRef.current = readStoredState();
  const z = storedInitRef.current!;

  const [filtersPanelOpen, setFiltersPanelOpen] = useState(z.filtersPanelOpen);

  const [quickSource, setQuickSource] = useState<QuickSourcePreset>(z.quickSource);
  const [stageId, setStageId] = useState<string>(z.stageId);
  const [temperatureFilter, setTemperatureFilter] = useState<
    LeadTemperature | typeof ANY_VALUE
  >(z.temperatureFilter);
  const [duplicateFilter, setDuplicateFilter] = useState<DuplicateFilter>(z.duplicateFilter);
  const [segmentExact, setSegmentExact] = useState<string>(z.segmentExact);
  const [searchText, setSearchText] = useState(z.searchText);
  const [requireTelegramId, setRequireTelegramId] = useState(z.requireTelegramId);
  const [requirePhone, setRequirePhone] = useState(z.requirePhone);
  const [requireEmail, setRequireEmail] = useState(z.requireEmail);
  const [consentYesOnly, setConsentYesOnly] = useState(z.consentYesOnly);
  const [requireGiftReceived, setRequireGiftReceived] = useState(z.requireGiftReceived);
  const [ownerFilter, setOwnerFilter] = useState<CrmContactsOwnerFilter>(z.ownerFilter);
  const [sortKey, setSortKey] = useState<CrmContactsSortKey>(z.sortKey);
  const [nextActionPreset, setNextActionPreset] = useState<CrmContactsNextActionPreset>(z.nextActionPreset);

  const [page, setPage] = useState(z.page);
  const [pageSize, setPageSize] = useState<CrmContactsPageSize>(z.pageSize);

  const skipFilterPageResetRef = useRef(true);
  useEffect(() => {
    if (skipFilterPageResetRef.current) {
      skipFilterPageResetRef.current = false;
      return;
    }
    setPage(1);
  }, [
    quickSource,
    stageId,
    temperatureFilter,
    duplicateFilter,
    segmentExact,
    searchText,
    requireTelegramId,
    requirePhone,
    requireEmail,
    consentYesOnly,
    requireGiftReceived,
    ownerFilter,
    nextActionPreset,
  ]);

  useEffect(() => {
    saveCrmContactsFilters({
      v: 1,
      filtersPanelOpen,
      quickSource,
      stageId,
      temperatureFilter,
      duplicateFilter,
      segmentExact,
      searchText,
      requireTelegramId,
      requirePhone,
      requireEmail,
      consentYesOnly,
      requireGiftReceived,
      ownerFilter,
      sortKey,
      nextActionPreset,
      page,
      pageSize,
    });
  }, [
    consentYesOnly,
    requireGiftReceived,
    duplicateFilter,
    filtersPanelOpen,
    nextActionPreset,
    ownerFilter,
    page,
    pageSize,
    quickSource,
    requireEmail,
    requirePhone,
    requireTelegramId,
    searchText,
    segmentExact,
    sortKey,
    stageId,
    temperatureFilter,
  ]);

  const { data: stages, isLoading: sLoading, error: sErr } = useQuery({
    queryKey: ["crm", "pipeline-stages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_pipeline_stages")
        .select("id, code, name, sort_order")
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as CrmPipelineStageRow[];
    },
  });

  const { data: profileNamesById } = useQuery({
    queryKey: ["crm", "profiles-display-names"],
    queryFn: async () => {
      const { data, error: pe } = await supabase
        .from("crm_profiles")
        .select("id, display_name")
        .eq("is_active", true);
      if (pe) throw pe;
      const m = new Map<string, string>();
      for (const row of (data ?? []) as Pick<CrmProfileRow, "id" | "display_name">[]) {
        m.set(row.id, row.display_name?.trim() || row.id.slice(0, 8));
      }
      return m;
    },
  });

  const { data: contactsMetaPayload, isLoading: metaLoading, error: metaErr } = useQuery({
    queryKey: ["crm", "contacts-meta"],
    queryFn: async () => {
      const { data, error: qe } = await supabase.rpc("crm_contacts_meta");
      if (qe) throw qe;
      return unwrapRpcJson(data as ContactsPageRpcRow | ContactsPageRpcRow[] | null) as ContactsMetaPayload | null;
    },
  });

  const naDayBounds = useMemo(() => {
    if (nextActionPreset !== "today") {
      return { start: null as string | null, end: null as string | null };
    }
    return {
      start: startOfDay(new Date()).toISOString(),
      end: endOfDay(new Date()).toISOString(),
    };
  }, [nextActionPreset]);

  const listRpcBase = useMemo(
    () => ({
      p_quick_source: quickSource,
      p_exact_channel: null,
      p_stage_id: stageId !== ANY_VALUE ? stageId : null,
      p_temperature: temperatureFilter !== ANY_VALUE ? temperatureFilter : null,
      p_duplicate_filter: duplicateFilter,
      p_segment_exact: segmentExact !== ANY_VALUE ? segmentExact : null,
      p_search: searchText.trim() || null,
      p_require_telegram: requireTelegramId,
      p_require_phone: requirePhone,
      p_require_email: requireEmail,
      p_consent_only: consentYesOnly,
      p_gift_received_filter: requireGiftReceived ? ("yes" as const) : ("any" as const),
      p_owner_filter: ownerFilter,
      p_my_user_id: myUserId,
      p_next_action_preset: nextActionPreset,
      p_na_day_start: naDayBounds.start,
      p_na_day_end: naDayBounds.end,
    }),
    [
      consentYesOnly,
      requireGiftReceived,
      duplicateFilter,
      myUserId,
      naDayBounds.end,
      naDayBounds.start,
      nextActionPreset,
      ownerFilter,
      quickSource,
      requireEmail,
      requirePhone,
      requireTelegramId,
      searchText,
      segmentExact,
      stageId,
      temperatureFilter,
    ],
  );

  const {
    data: contactsPagePayload,
    isLoading: contactsPageLoading,
    error: contactsPageErr,
  } = useQuery({
    queryKey: ["crm", "contacts-page", listRpcBase, sortKey, pageSize, page],
    queryFn: async () => {
      const offset = Math.max(0, (page - 1) * pageSize);
      const { data, error: qe } = await supabase.rpc("crm_list_contacts_page", {
        ...listRpcBase,
        p_sort: sortKey,
        p_limit: pageSize,
        p_offset: offset,
      });
      if (qe) throw qe;
      const raw = unwrapRpcJson(data as ContactsPageRpcRow | ContactsPageRpcRow[] | null);
      const tr = raw?.total;
      const total =
        typeof tr === "bigint"
          ? Number(tr)
          : typeof tr === "string"
            ? parseInt(tr, 10)
            : Number(tr ?? 0);
      const rowsRaw = raw?.rows;
      const rows = Array.isArray(rowsRaw)
        ? (rowsRaw.filter((x) => x && typeof x === "object") as CrmContactRow[])
        : [];
      return { rows, total: Number.isFinite(total) ? total : 0 };
    },
  });

  const stageNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of stages ?? []) m.set(s.id, s.name);
    return m;
  }, [stages]);

  const qc = contactsMetaPayload?.quick_counts;
  const quickCounts: ContactsMetaQuickCounts = {
    all: qc?.all ?? 0,
    crm: qc?.crm ?? 0,
    bot: qc?.bot ?? 0,
    site: qc?.site ?? 0,
    channel: qc?.channel ?? 0,
    vk: qc?.vk ?? 0,
    instagram: qc?.instagram ?? 0,
    other: qc?.other ?? 0,
  };

  const distinctSegments = useMemo(
    () => coerceStringArray(contactsMetaPayload?.segments),
    [contactsMetaPayload?.segments],
  );

  const totalFiltered = contactsPagePayload?.total ?? 0;
  const totalPages = totalFiltered <= 0 ? 1 : Math.max(1, Math.ceil(totalFiltered / pageSize));
  const displayPage = Math.min(Math.max(1, page), totalPages);

  useEffect(() => {
    if (page !== displayPage) {
      setPage(displayPage);
    }
  }, [page, displayPage]);

  const pagedContacts = contactsPagePayload?.rows ?? [];

  const rangeFrom = totalFiltered === 0 ? 0 : (displayPage - 1) * pageSize + 1;
  const rangeTo =
    totalFiltered === 0 ? 0 : Math.min(totalFiltered, displayPage * pageSize);

  const persistSnapshot = {
    filtersPanelOpen,
    quickSource,
    stageId,
    temperatureFilter,
    duplicateFilter,
    segmentExact,
    searchText,
    requireTelegramId,
    requirePhone,
    requireEmail,
    consentYesOnly,
    requireGiftReceived,
    ownerFilter,
    sortKey,
    nextActionPreset,
    page,
    pageSize,
  };

  const filterSummaryCollapsed = summarizeCrmFilters(persistSnapshot);

  const resetFilters = () => {
    setQuickSource("all");
    setStageId(ANY_VALUE);
    setTemperatureFilter(ANY_VALUE);
    setDuplicateFilter("any");
    setSegmentExact(ANY_VALUE);
    setSearchText("");
    setRequireTelegramId(false);
    setRequirePhone(false);
    setRequireEmail(false);
    setConsentYesOnly(false);
    setRequireGiftReceived(false);
    setOwnerFilter("any");
    setNextActionPreset("any");
    setPage(1);
  };

  if (sLoading || contactsPageLoading || metaLoading) {
    return <p className="text-sm text-muted-foreground">Загрузка…</p>;
  }

  if (contactsPageErr || metaErr || sErr) {
    return (
      <p className="text-sm text-destructive">
        Ошибка: {(contactsPageErr ?? metaErr ?? sErr)!.message}
      </p>
    );
  }

  const hasActiveFilters =
    quickSource !== "all" ||
    ownerFilter !== "any" ||
    nextActionPreset !== "any" ||
    stageId !== ANY_VALUE ||
    temperatureFilter !== ANY_VALUE ||
    duplicateFilter !== "any" ||
    segmentExact !== ANY_VALUE ||
    searchText.trim() !== "" ||
    requireTelegramId ||
    requirePhone ||
    requireEmail ||
    consentYesOnly ||
    requireGiftReceived;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-3xl text-foreground">Контакты</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Список лидов и рабочие фильтры (мои, следующий шаг, сортировка). Фильтры сохраняются в этом браузере.
          </p>
        </div>
        {canWriteCrm ? (
          <Button type="button" variant="outline" size="sm" className="h-9 shrink-0 border-hairline" asChild>
            <Link to="/admin/crm/contacts/new">Новый контакт</Link>
          </Button>
        ) : null}
      </div>

      <Collapsible open={filtersPanelOpen} onOpenChange={setFiltersPanelOpen}>
        <div className="overflow-hidden rounded-sm border border-hairline bg-surface/15">
          <div className="flex flex-col gap-3 border-b border-hairline p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
              <CollapsibleTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={cn(
                    "h-9 shrink-0 justify-between gap-2 border-hairline sm:justify-start",
                    filtersPanelOpen && "border-accent/50",
                  )}
                  aria-expanded={filtersPanelOpen}
                >
                  <span className="text-xs uppercase tracking-wider text-muted-foreground">Фильтры</span>
                  <ChevronDown
                    className={cn("h-4 w-4 transition-transform duration-200", filtersPanelOpen && "rotate-180")}
                  />
                </Button>
              </CollapsibleTrigger>
              {!filtersPanelOpen ? (
                <p className="truncate text-xs text-muted-foreground">
                  {filterSummaryCollapsed ?? "Не заданы — показаны все контакты"}
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              <span className="text-xs text-muted-foreground">
                Всего в списке: <span className="tabular-nums text-foreground">{totalFiltered}</span>
              </span>
              {hasActiveFilters ? (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="rounded-sm border border-hairline px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-accent hover:text-accent"
                >
                  Сбросить фильтры
                </button>
              ) : null}
            </div>
          </div>

          <CollapsibleContent>
            <div className="space-y-4 p-4 pt-5">
              <div className="flex flex-wrap gap-2">
                <span className="w-full py-1 text-[10px] uppercase tracking-wider text-muted-foreground sm:w-auto">
                  Канал
                </span>
                {(
                  [{ id: "all" as const, label: "Все", count: quickCounts.all }] as const
                )
                  .concat(
                    CRM_LEAD_SOURCES.map((src) => ({
                      id: src.code,
                      label: src.label,
                      count: quickCounts[src.code],
                    })),
                  )
                  .map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setQuickSource(opt.id)}
                    className={`rounded-sm border px-3 py-1.5 text-xs transition-colors ${
                      quickSource === opt.id
                        ? "border-accent text-accent"
                        : "border-hairline text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {opt.label} ({opt.count})
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Этап воронки</Label>
                  <Select value={stageId} onValueChange={setStageId}>
                    <SelectTrigger className="border-hairline">
                      <SelectValue placeholder="Любой этап" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ANY_VALUE}>Любой этап</SelectItem>
                      {(stages ?? []).map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Температура лида</Label>
                  <Select
                    value={temperatureFilter}
                    onValueChange={(v) =>
                      setTemperatureFilter(v === ANY_VALUE ? ANY_VALUE : (v as LeadTemperature))
                    }
                  >
                    <SelectTrigger className="border-hairline">
                      <SelectValue placeholder="Любая" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ANY_VALUE}>Любая</SelectItem>
                      <SelectItem value="cold">Холодный</SelectItem>
                      <SelectItem value="warm">Тёплый</SelectItem>
                      <SelectItem value="hot">Горячий</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Дубликаты</Label>
                  <Select value={duplicateFilter} onValueChange={(v) => setDuplicateFilter(v as DuplicateFilter)}>
                    <SelectTrigger className="border-hairline">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Все</SelectItem>
                      <SelectItem value="hide">Скрыть дубликаты</SelectItem>
                      <SelectItem value="only">Только дубликаты</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Ответственный</Label>
                  <Select
                    value={ownerFilter}
                    onValueChange={(v) => setOwnerFilter(v as CrmContactsOwnerFilter)}
                  >
                    <SelectTrigger className="border-hairline">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Все</SelectItem>
                      <SelectItem value="mine">Только мои</SelectItem>
                      <SelectItem value="unassigned">Без ответственного</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Следующее действие</Label>
                  <Select
                    value={nextActionPreset}
                    onValueChange={(v) => setNextActionPreset(v as CrmContactsNextActionPreset)}
                  >
                    <SelectTrigger className="border-hairline">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Не фильтровать</SelectItem>
                      <SelectItem value="scheduled">Запланировано (есть дата)</SelectItem>
                      <SelectItem value="overdue">Просрочено</SelectItem>
                      <SelectItem value="today">Сегодня</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Сегмент</Label>
                  <Select value={segmentExact} onValueChange={setSegmentExact}>
                    <SelectTrigger className="border-hairline">
                      <SelectValue placeholder="Любой" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ANY_VALUE}>Любой сегмент</SelectItem>
                      {distinctSegments.map((seg) => (
                        <SelectItem key={seg} value={seg}>
                          {seg}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2 md:col-span-2 lg:col-span-3">
                  <Label className="text-xs text-muted-foreground">
                    Поиск по имени, телефону, email, UTM и полям источника
                  </Label>
                  <Input
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    placeholder="Начните вводить…"
                    className="border-hairline"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-3 border-t border-hairline pt-4 sm:flex-row sm:flex-wrap sm:gap-6">
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox checked={requireTelegramId} onCheckedChange={(c) => setRequireTelegramId(c === true)} />
                  Есть Telegram ID
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox checked={requirePhone} onCheckedChange={(c) => setRequirePhone(c === true)} />
                  Указан телефон
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox checked={requireEmail} onCheckedChange={(c) => setRequireEmail(c === true)} />
                  Указан email
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox checked={consentYesOnly} onCheckedChange={(c) => setConsentYesOnly(c === true)} />
                  Согласие на ПДн
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox checked={requireGiftReceived} onCheckedChange={(c) => setRequireGiftReceived(c === true)} />
                  Подарок получен
                </label>
              </div>
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>

      <div className="space-y-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <span className="text-sm text-muted-foreground">
            После фильтрации —{" "}
            <strong className="font-medium tabular-nums text-foreground">{totalFiltered}</strong> контактов; на странице
            строк: <strong className="tabular-nums text-foreground">{rangeFrom}</strong> —
            <strong className="tabular-nums text-foreground"> {rangeTo}</strong>
          </span>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Label className="whitespace-nowrap text-xs text-muted-foreground">Сортировка</Label>
              <Select value={sortKey} onValueChange={(v) => setSortKey(v as CrmContactsSortKey)}>
                <SelectTrigger className="h-9 min-w-[200px] border-hairline">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="activity">По активности</SelectItem>
                  <SelectItem value="next_action">По следующему шагу</SelectItem>
                  <SelectItem value="created">По дате создания</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Label className="whitespace-nowrap text-xs text-muted-foreground">На странице</Label>
              <Select
                value={String(pageSize)}
                onValueChange={(v) => {
                  const next = coercePageSize(Number(v));
                  setPageSize(next);
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-9 w-[88px] border-hairline">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 border-hairline"
                disabled={displayPage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Назад
              </Button>
              <span className="font-mono text-xs text-muted-foreground">
                {displayPage}&nbsp;/&nbsp;{totalPages}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 border-hairline"
                disabled={displayPage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Вперёд
              </Button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto rounded-sm border border-hairline">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs uppercase tracking-wider">Имя</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Телефон</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Email</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Источник</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Подарок</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Этап</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Ответств.</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">След. шаг</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Активность</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagedContacts.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link
                      to={`/admin/crm/contacts/${c.id}`}
                      className="font-medium text-accent underline-offset-2 hover:underline"
                    >
                      {c.full_name || `Клиент ${c.id.slice(0, 8)}`}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{c.phone || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{c.email || "—"}</TableCell>
                  <TableCell className="text-sm">
                    <span className="text-foreground">{crmLeadSourceLabel(c.source_channel)}</span>
                    {c.source_detail ? (
                      <span className="ml-1 text-xs text-muted-foreground">· {c.source_detail}</span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-sm tabular-nums text-muted-foreground">
                    {c.gift_received === true ? (
                      <span className="text-foreground">Да</span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {c.current_stage_id ? (stageNameById.get(c.current_stage_id) ?? "—") : "—"}
                  </TableCell>
                  <TableCell className="max-w-[140px] truncate text-sm text-muted-foreground">
                    {!c.owner_user_id
                      ? "—"
                      : (profileNamesById?.get(c.owner_user_id) ?? `id ${c.owner_user_id.slice(0, 8)}`)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {c.next_action_at
                      ? format(parseISO(c.next_action_at), "d MMM yyyy HH:mm", { locale: ru })
                      : "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {c.last_activity_at
                      ? format(parseISO(c.last_activity_at), "d MMM yyyy HH:mm", { locale: ru })
                      : "—"}
                  </TableCell>
                </TableRow>
              ))}
              {totalFiltered === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground">
                    Нет контактов по выбранным фильтрам
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}