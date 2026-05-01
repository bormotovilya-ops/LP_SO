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
import type { CrmContactRow, CrmPipelineStageRow, LeadTemperature } from "@/types/crm";
import {
  CRM_CONTACTS_ANY_VALUE as ANY_VALUE,
  type CrmContactsPageSize,
  type DuplicateFilter,
  type QuickSourcePreset,
  coercePageSize,
  loadCrmContactsFilters,
  saveCrmContactsFilters,
  summarizeCrmFilters,
} from "@/lib/crmContactsFiltersStorage";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";

/** Каналы, которые считаем «с сайта» (см. crm_upsert_contact и лендинги). */
const SITE_SOURCE_CHANNELS = new Set(["site", "site_form", "site_quiz"]);

function normalizeLeadTemperature(row: CrmContactRow): LeadTemperature {
  const t = row.lead_temperature;
  if (t === "warm" || t === "hot") return t;
  return "cold";
}

function matchesSearch(row: CrmContactRow, q: string): boolean {
  if (!q) return true;
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const parts = [
    row.full_name,
    row.email,
    row.phone,
    row.source_detail,
    row.segment,
    row.utm_source,
    row.utm_campaign,
  ]
    .filter(Boolean)
    .map((x) => String(x).toLowerCase());
  return parts.some((p) => p.includes(needle));
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
  if (
    s?.quickSource === "site" ||
    s?.quickSource === "telegram" ||
    s?.quickSource === "unknown" ||
    s?.quickSource === "all"
  ) {
    qs = s.quickSource;
  }

  return {
    filtersPanelOpen: s?.filtersPanelOpen === true,
    quickSource: qs,
    exactChannel: typeof s?.exactChannel === "string" ? s.exactChannel : ANY_VALUE,
    stageId: typeof s?.stageId === "string" ? s.stageId : ANY_VALUE,
    temperatureFilter: temp,
    duplicateFilter: duplicateOk,
    segmentExact: typeof s?.segmentExact === "string" ? s.segmentExact : ANY_VALUE,
    searchText: typeof s?.searchText === "string" ? s.searchText : "",
    requireTelegramId: Boolean(s?.requireTelegramId),
    requirePhone: Boolean(s?.requirePhone),
    requireEmail: Boolean(s?.requireEmail),
    consentYesOnly: Boolean(s?.consentYesOnly),
    page: Math.max(1, parseInt(String(s?.page ?? "1"), 10) || 1),
    pageSize: coercePageSize(s?.pageSize),
  };
}

export default function CrmContacts() {
  const supabase = getSupabase();
  /** Одноразовое чтение сохранённых фильтров (без парсинга JSON на каждом рендере). */
  const storedInitRef = useRef<ReturnType<typeof readStoredState> | null>(null);
  if (!storedInitRef.current) storedInitRef.current = readStoredState();
  const z = storedInitRef.current!;

  const [filtersPanelOpen, setFiltersPanelOpen] = useState(z.filtersPanelOpen);

  const [quickSource, setQuickSource] = useState<QuickSourcePreset>(z.quickSource);
  const [exactChannel, setExactChannel] = useState<string>(z.exactChannel);
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
    exactChannel,
    stageId,
    temperatureFilter,
    duplicateFilter,
    segmentExact,
    searchText,
    requireTelegramId,
    requirePhone,
    requireEmail,
    consentYesOnly,
  ]);

  useEffect(() => {
    saveCrmContactsFilters({
      v: 1,
      filtersPanelOpen,
      quickSource,
      exactChannel,
      stageId,
      temperatureFilter,
      duplicateFilter,
      segmentExact,
      searchText,
      requireTelegramId,
      requirePhone,
      requireEmail,
      consentYesOnly,
      page,
      pageSize,
    });
  }, [
    consentYesOnly,
    duplicateFilter,
    exactChannel,
    filtersPanelOpen,
    page,
    pageSize,
    quickSource,
    requireEmail,
    requirePhone,
    requireTelegramId,
    searchText,
    segmentExact,
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

  const { data: contacts, isLoading, error } = useQuery({
    queryKey: ["crm", "contacts-list"],
    queryFn: async () => {
      const { data, error: qErr } = await supabase
        .from("crm_contacts")
        .select(
          [
            "id",
            "full_name",
            "phone",
            "email",
            "telegram_id",
            "source_channel",
            "source_detail",
            "utm_source",
            "utm_campaign",
            "segment",
            "lead_temperature",
            "is_duplicate",
            "consent_personal_data",
            "current_stage_id",
            "last_activity_at",
            "created_at",
          ].join(", "),
        )
        .order("last_activity_at", { ascending: false, nullsFirst: false });
      if (qErr) throw qErr;
      return (data ?? []) as CrmContactRow[];
    },
  });

  const stageNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of stages ?? []) m.set(s.id, s.name);
    return m;
  }, [stages]);

  const allContacts = contacts ?? [];

  const distinctChannels = useMemo(() => {
    const s = new Set(allContacts.map((c) => c.source_channel ?? "").filter(Boolean));
    return [...s].sort((a, b) => a.localeCompare(b, "ru"));
  }, [allContacts]);

  const distinctSegments = useMemo(() => {
    const s = new Set(allContacts.map((c) => c.segment?.trim()).filter(Boolean) as string[]);
    return [...s].sort((a, b) => a.localeCompare(b, "ru"));
  }, [allContacts]);

  const quickCounts = useMemo(() => {
    const site = allContacts.filter((c) => SITE_SOURCE_CHANNELS.has((c.source_channel || "").trim()));
    const telegram = allContacts.filter((c) => Boolean(c.telegram_id) || c.source_channel === "telegram_bot");
    const unknown = allContacts.filter((c) => {
      const ch = (c.source_channel || "").trim();
      return !ch || ch === "unknown";
    });
    return {
      all: allContacts.length,
      site: site.length,
      telegramN: telegram.length,
      unknown: unknown.length,
    };
  }, [allContacts]);

  const filteredContacts = useMemo(() => {
    let list = allContacts;

    if (exactChannel !== ANY_VALUE) {
      list = list.filter((c) => (c.source_channel || "").trim() === exactChannel);
    } else {
      switch (quickSource) {
        case "site":
          list = list.filter((c) => SITE_SOURCE_CHANNELS.has((c.source_channel || "").trim()));
          break;
        case "telegram":
          list = list.filter((c) => Boolean(c.telegram_id) || c.source_channel === "telegram_bot");
          break;
        case "unknown":
          list = list.filter((c) => {
            const ch = (c.source_channel || "").trim();
            return !ch || ch === "unknown";
          });
          break;
        default:
          break;
      }
    }

    if (stageId !== ANY_VALUE) {
      list = list.filter((c) => c.current_stage_id === stageId);
    }

    if (temperatureFilter !== ANY_VALUE) {
      list = list.filter((c) => normalizeLeadTemperature(c) === temperatureFilter);
    }

    if (duplicateFilter === "only") {
      list = list.filter((c) => c.is_duplicate === true);
    } else if (duplicateFilter === "hide") {
      list = list.filter((c) => !c.is_duplicate);
    }

    if (segmentExact !== ANY_VALUE) {
      list = list.filter((c) => (c.segment || "").trim() === segmentExact);
    }

    if (requireTelegramId) {
      list = list.filter((c) => c.telegram_id != null);
    }
    if (requirePhone) {
      list = list.filter((c) => !!c.phone && c.phone.trim() !== "");
    }
    if (requireEmail) {
      list = list.filter((c) => !!c.email && c.email.trim() !== "");
    }
    if (consentYesOnly) {
      list = list.filter((c) => c.consent_personal_data === true);
    }

    if (searchText.trim()) {
      list = list.filter((c) => matchesSearch(c, searchText));
    }

    return list;
  }, [
    allContacts,
    consentYesOnly,
    duplicateFilter,
    exactChannel,
    quickSource,
    requireEmail,
    requirePhone,
    requireTelegramId,
    searchText,
    segmentExact,
    stageId,
    temperatureFilter,
  ]);

  const totalFiltered = filteredContacts.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
  const effectivePage = Math.min(Math.max(1, page), totalPages);

  useEffect(() => {
    if (page !== effectivePage) {
      setPage(effectivePage);
    }
  }, [page, effectivePage]);

  const pagedContacts = useMemo(() => {
    const start = (effectivePage - 1) * pageSize;
    return filteredContacts.slice(start, start + pageSize);
  }, [effectivePage, filteredContacts, pageSize]);

  const rangeFrom = totalFiltered === 0 ? 0 : (effectivePage - 1) * pageSize + 1;
  const rangeTo = Math.min(totalFiltered, effectivePage * pageSize);

  const persistSnapshot = {
    filtersPanelOpen,
    quickSource,
    exactChannel,
    stageId,
    temperatureFilter,
    duplicateFilter,
    segmentExact,
    searchText,
    requireTelegramId,
    requirePhone,
    requireEmail,
    consentYesOnly,
    page,
    pageSize,
  };

  const filterSummaryCollapsed = summarizeCrmFilters(persistSnapshot);

  const resetFilters = () => {
    setQuickSource("all");
    setExactChannel(ANY_VALUE);
    setStageId(ANY_VALUE);
    setTemperatureFilter(ANY_VALUE);
    setDuplicateFilter("any");
    setSegmentExact(ANY_VALUE);
    setSearchText("");
    setRequireTelegramId(false);
    setRequirePhone(false);
    setRequireEmail(false);
    setConsentYesOnly(false);
    setPage(1);
  };

  if (sLoading || isLoading) {
    return <p className="text-sm text-muted-foreground">Загрузка…</p>;
  }

  if (error || sErr) {
    return <p className="text-sm text-destructive">Ошибка: {(error ?? sErr)!.message}</p>;
  }

  const hasActiveFilters =
    quickSource !== "all" ||
    exactChannel !== ANY_VALUE ||
    stageId !== ANY_VALUE ||
    temperatureFilter !== ANY_VALUE ||
    duplicateFilter !== "any" ||
    segmentExact !== ANY_VALUE ||
    searchText.trim() !== "" ||
    requireTelegramId ||
    requirePhone ||
    requireEmail ||
    consentYesOnly;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl text-foreground">Контакты</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Список лидов, сортировка по последней активности. Фильтры сохраняются в этом браузере.
        </p>
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
                Всего в списке: <span className="tabular-nums text-foreground">{allContacts.length}</span>
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
                  Источник
                </span>
                {(
                  [
                    { id: "all" as const, label: "Все", count: quickCounts.all },
                    { id: "site" as const, label: "С сайта", count: quickCounts.site },
                    { id: "telegram" as const, label: "Telegram / бот", count: quickCounts.telegramN },
                    { id: "unknown" as const, label: "Канал неизвестен", count: quickCounts.unknown },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setQuickSource(opt.id);
                      setExactChannel(ANY_VALUE);
                    }}
                    className={`rounded-sm border px-3 py-1.5 text-xs transition-colors ${
                      quickSource === opt.id && exactChannel === ANY_VALUE
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
                  <Label className="text-xs text-muted-foreground">Канал (точное значение)</Label>
                  <Select
                    value={exactChannel}
                    onValueChange={(v) => {
                      setExactChannel(v);
                      if (v !== ANY_VALUE) setQuickSource("all");
                    }}
                  >
                    <SelectTrigger className="border-hairline">
                      <SelectValue placeholder="Все каналы" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ANY_VALUE}>Все каналы</SelectItem>
                      {distinctChannels.map((ch) => (
                        <SelectItem key={ch} value={ch}>
                          {ch}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

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
                disabled={effectivePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Назад
              </Button>
              <span className="font-mono text-xs text-muted-foreground">
                {effectivePage}&nbsp;/&nbsp;{totalPages}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 border-hairline"
                disabled={effectivePage >= totalPages}
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
                <TableHead className="text-xs uppercase tracking-wider">Этап</TableHead>
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
                    <span className="text-foreground">{c.source_channel}</span>
                    {c.source_detail ? (
                      <span className="ml-1 text-xs text-muted-foreground">· {c.source_detail}</span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-sm">
                    {c.current_stage_id ? (stageNameById.get(c.current_stage_id) ?? "—") : "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {c.last_activity_at
                      ? format(parseISO(c.last_activity_at), "d MMM yyyy HH:mm", { locale: ru })
                      : "—"}
                  </TableCell>
                </TableRow>
              ))}
              {filteredContacts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
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