import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
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
import type { CrmContactRow, CrmPipelineStageRow, LeadTemperature } from "@/types/crm";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";

/** Каналы, которые считаем «с сайта» (см. crm_upsert_contact и лендинги). */
const SITE_SOURCE_CHANNELS = new Set(["site", "site_form", "site_quiz"]);

type QuickSourcePreset = "all" | "site" | "telegram" | "unknown";

type DuplicateFilter = "any" | "only" | "hide";

const ANY_VALUE = "__any__";

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

export default function CrmContacts() {
  const supabase = getSupabase();

  const [quickSource, setQuickSource] = useState<QuickSourcePreset>("all");
  const [exactChannel, setExactChannel] = useState<string>(ANY_VALUE);
  const [stageId, setStageId] = useState<string>(ANY_VALUE);
  const [temperatureFilter, setTemperatureFilter] = useState<
    LeadTemperature | typeof ANY_VALUE
  >(ANY_VALUE);
  const [duplicateFilter, setDuplicateFilter] = useState<DuplicateFilter>("any");
  const [segmentExact, setSegmentExact] = useState<string>(ANY_VALUE);
  const [searchText, setSearchText] = useState("");
  const [requireTelegramId, setRequireTelegramId] = useState(false);
  const [requirePhone, setRequirePhone] = useState(false);
  const [requireEmail, setRequireEmail] = useState(false);
  const [consentYesOnly, setConsentYesOnly] = useState(false);

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
          Список лидов, сортировка по последней активности. Используйте фильтры ниже.
        </p>
      </div>

      <div className="space-y-4 rounded-sm border border-hairline bg-surface/15 p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Фильтры</p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">
              Показано{" "}
              <span className="font-medium text-foreground tabular-nums">{filteredContacts.length}</span> из{" "}
              <span className="tabular-nums">{allContacts.length}</span>
            </span>
            {hasActiveFilters ? (
              <button
                type="button"
                onClick={resetFilters}
                className="rounded-sm border border-hairline px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-accent hover:text-accent"
              >
                Сбросить
              </button>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="w-full text-[10px] uppercase tracking-wider text-muted-foreground sm:w-auto sm:py-1.5">
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
            {filteredContacts.map((c) => (
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
  );
}
