import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartArea, ChartColumn, ChartGantt, ChartLine, PieChart as PieChartIcon } from "lucide-react";
import { getSupabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";

type FunnelChartVariant = "bar" | "barHorizontal" | "pie";

type TrendChartVariant = "line" | "bar" | "area";

type FunnelRow = { name: string; code: string; count: number };

type TrendDatum = { label: string; count: number };

const TASK_BY_ASSIGNEE_ALL = "__all__" as const;

type TaskAssigneeBreakdownRpc = {
  assignee_key: string;
  label: string;
  open: number | string;
  in_progress: number | string;
  done: number | string;
  cancelled: number | string;
};

type TaskStatusCountKey = Exclude<keyof TaskAssigneeBreakdownRpc, "assignee_key" | "label">;

const TASK_STATUS_CHART_ROWS: readonly { field: TaskStatusCountKey; label: string; code: string }[] = [
  { field: "open", label: "Открыта", code: "open" },
  { field: "in_progress", label: "В работе", code: "in_progress" },
  { field: "done", label: "Завершена", code: "done" },
  { field: "cancelled", label: "Отменена", code: "cancelled" },
] as const;

type DashboardMetrics = {
  total_contacts: number;
  new_contacts_last_7d: number;
  funnel: Array<{
    stage_id: string | null;
    code: string;
    name: string;
    sort_order: number;
    count: number | string;
  }>;
  top_source_channels: Array<{ channel: string; count: number | string }>;
  tasks_total_all: number;
  tasks_active_open_progress: number;
  tasks_overdue_active: number;
  task_breakdown_by_assignee: TaskAssigneeBreakdownRpc[];
  sla_first_activity: {
    cohort_with_activity: number | string;
    pct_within_24h: number | string | null;
    median_hours_to_activity: number | string | null;
  };
  new_per_day_utc_7d: Array<{ key: string; count: number | string }>;
};

function num(x: unknown, fallback = 0): number {
  if (typeof x === "number" && Number.isFinite(x)) return x;
  if (typeof x === "bigint") return Number(x);
  if (typeof x === "string" && x.trim() !== "") {
    const n = parseFloat(x);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

/** Подписи на графике воронки: убираем пояснения в скобках, чтобы строки были короче. */
function stageChartLabel(displayName: string): string {
  const s = displayName.trim();
  const shortened = s.replace(/\s*\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
  return shortened || s;
}

function unwrapRpcDashboard(data: unknown): Record<string, unknown> | null {
  if (Array.isArray(data)) {
    const first = data[0];
    return first && typeof first === "object" ? (first as Record<string, unknown>) : null;
  }
  return data && typeof data === "object" ? (data as Record<string, unknown>) : null;
}

function parseDashboardMetrics(raw: unknown): DashboardMetrics | null {
  const o = unwrapRpcDashboard(raw);
  if (!o) return null;
  return {
    total_contacts: num(o.total_contacts),
    new_contacts_last_7d: num(o.new_contacts_last_7d),
    funnel: Array.isArray(o.funnel) ? (o.funnel as DashboardMetrics["funnel"]) : [],
    top_source_channels: Array.isArray(o.top_source_channels)
      ? (o.top_source_channels as DashboardMetrics["top_source_channels"])
      : [],
    sla_first_activity: ((): DashboardMetrics["sla_first_activity"] => {
      const s = o.sla_first_activity;
      if (!s || typeof s !== "object") {
        return { cohort_with_activity: 0, pct_within_24h: null, median_hours_to_activity: null };
      }
      const r = s as Record<string, unknown>;
      return {
        cohort_with_activity: num(r.cohort_with_activity),
        pct_within_24h: r.pct_within_24h == null ? null : num(r.pct_within_24h),
        median_hours_to_activity: r.median_hours_to_activity == null ? null : num(r.median_hours_to_activity),
      };
    })(),
    new_per_day_utc_7d: Array.isArray(o.new_per_day_utc_7d)
      ? (o.new_per_day_utc_7d as DashboardMetrics["new_per_day_utc_7d"])
      : [],
    tasks_total_all: num(o.tasks_total_all),
    tasks_active_open_progress: num(o.tasks_active_open_progress),
    tasks_overdue_active: num(o.tasks_overdue_active),
    task_breakdown_by_assignee: Array.isArray(o.task_breakdown_by_assignee)
      ? (o.task_breakdown_by_assignee as TaskAssigneeBreakdownRpc[])
      : [],
  };
}

function taskBreakdownTotals(rows: TaskAssigneeBreakdownRpc[]): Record<TaskStatusCountKey, number> {
  const z: Record<TaskStatusCountKey, number> = {
    open: 0,
    in_progress: 0,
    done: 0,
    cancelled: 0,
  };
  for (const r of rows) {
    z.open += num(r.open);
    z.in_progress += num(r.in_progress);
    z.done += num(r.done);
    z.cancelled += num(r.cancelled);
  }
  return z;
}

function rowToStatusTotals(r: TaskAssigneeBreakdownRpc): Record<TaskStatusCountKey, number> {
  return {
    open: num(r.open),
    in_progress: num(r.in_progress),
    done: num(r.done),
    cancelled: num(r.cancelled),
  };
}

function taskCountsToFunnelBars(totals: Record<TaskStatusCountKey, number>): FunnelRow[] {
  return TASK_STATUS_CHART_ROWS.map((row) => ({
    name: row.label,
    code: row.code,
    count: totals[row.field],
  }));
}

function mapRpcTrendToChart(rows: DashboardMetrics["new_per_day_utc_7d"]): TrendDatum[] {
  const out: TrendDatum[] = [];
  for (const r of rows) {
    let label = r.key ?? "";
    try {
      if (r.key) label = format(parseISO(`${r.key}T12:00:00Z`), "d MMM", { locale: ru });
    } catch {
      /* keep key */
    }
    out.push({ label, count: num(r.count) });
  }
  return out;
}

const chartTooltipStyles = {
  background: "hsl(var(--background))",
  border: "1px solid hsl(var(--hairline))",
  borderRadius: "4px",
  fontSize: 12,
} as const;

const axisMuted = { fontSize: 10, fill: "hsl(var(--muted-foreground))" };

/** Цвета сегментов круговой диаграммы — только токены темы (видны на любой палитре [data-theme]). */
const THEME_PIE_SEGMENT_FILLS = [
  "hsl(var(--accent))",
  "hsl(var(--accent-soft))",
  "hsl(var(--secondary))",
  "hsl(var(--surface))",
  "hsl(var(--muted-foreground))",
  "hsl(var(--hairline))",
  "hsl(var(--destructive) / 0.88)",
] as const;

function pieFillForIndex(index: number): string {
  return THEME_PIE_SEGMENT_FILLS[index % THEME_PIE_SEGMENT_FILLS.length]!;
}

function FunnelChartView({
  variant,
  data,
  countLabel = "Лидов",
}: {
  variant: FunnelChartVariant;
  data: FunnelRow[];
  /** Подпись в столбце/туултипе («Лидов», «Задач» и т.д.). */
  countLabel?: string;
}) {
  const accentStroke = "hsl(var(--accent))";
  const nonZeroPie = data.filter((d) => d.count > 0);

  if (variant === "barHorizontal") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          layout="vertical"
          data={data}
          margin={{ top: 8, right: 24, left: 4, bottom: 8 }}
        >
          <CartesianGrid stroke="hsl(var(--hairline))" horizontal={false} />
          <XAxis type="number" allowDecimals={false} tick={axisMuted} />
          <YAxis
            type="category"
            dataKey="name"
            width={108}
            tick={{ ...axisMuted, fontSize: 9 }}
          />
          <Tooltip contentStyle={chartTooltipStyles} formatter={(v: number) => [`${v}`, countLabel]} />
          <Bar dataKey="count" fill={accentStroke} radius={[0, 2, 2, 0]} name={countLabel} />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (variant === "pie") {
    const pieRows = nonZeroPie.length ? nonZeroPie : [{ name: "Нет данных", code: "_", count: 1 }];
    const emptyPlaceholder = !nonZeroPie.length;
    return (
      <ResponsiveContainer width="100%" height="100%">
        <PieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
          <Pie
            data={pieRows}
            dataKey="count"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={28}
            outerRadius={92}
            paddingAngle={1}
            stroke="hsl(var(--background))"
            strokeWidth={2}
          >
            {pieRows.map((_, i) => (
              <Cell
                key={pieRows[i].code}
                fill={
                  emptyPlaceholder ? "hsl(var(--muted) / 0.55)" : pieFillForIndex(i)
                }
              />
            ))}
          </Pie>
          <Tooltip contentStyle={chartTooltipStyles} />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 32 }}>
        <CartesianGrid stroke="hsl(var(--hairline))" vertical={false} />
        <XAxis
          dataKey="name"
          tick={axisMuted}
          interval={0}
          angle={-18}
          textAnchor="end"
          height={64}
        />
        <YAxis allowDecimals={false} tick={axisMuted} />
        <Tooltip contentStyle={chartTooltipStyles} formatter={(v: number) => [`${v}`, countLabel]} />
        <Bar dataKey="count" fill={accentStroke} radius={[2, 2, 0, 0]} name={countLabel} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function TrendChartView({ variant, data }: { variant: TrendChartVariant; data: TrendDatum[] }) {
  const accentStroke = "hsl(var(--accent))";

  if (variant === "bar") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="hsl(var(--hairline))" vertical={false} />
          <XAxis dataKey="label" tick={axisMuted} />
          <YAxis allowDecimals={false} tick={axisMuted} />
          <Tooltip contentStyle={chartTooltipStyles} />
          <Bar dataKey="count" fill={accentStroke} radius={[2, 2, 0, 0]} name="Новых" />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (variant === "area") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="hsl(var(--hairline))" vertical={false} />
          <defs>
            <linearGradient id="trendAreaFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={accentStroke} stopOpacity={0.35} />
              <stop offset="100%" stopColor={accentStroke} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <XAxis dataKey="label" tick={axisMuted} />
          <YAxis allowDecimals={false} tick={axisMuted} />
          <Tooltip contentStyle={chartTooltipStyles} />
          <Area
            type="monotone"
            dataKey="count"
            stroke={accentStroke}
            strokeWidth={2}
            fill="url(#trendAreaFill)"
            dot={{ r: 2 }}
            name="Новых"
          />
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="hsl(var(--hairline))" vertical={false} />
        <XAxis dataKey="label" tick={axisMuted} />
        <YAxis allowDecimals={false} tick={axisMuted} />
        <Tooltip contentStyle={chartTooltipStyles} />
        <Line type="monotone" dataKey="count" stroke={accentStroke} strokeWidth={2} dot name="Новых" />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Рендер только при валидном `metrics`, чтобы не читать поля у `null` до guard (и не ловить гонки на первом кадре). */
function CrmDashboardLoaded({ metrics }: { metrics: DashboardMetrics }) {
  const [funnelVariant, setFunnelVariant] = useState<FunnelChartVariant>("bar");
  const [trendVariant, setTrendVariant] = useState<TrendChartVariant>("line");
  const [taskAssigneeKey, setTaskAssigneeKey] = useState<string>(TASK_BY_ASSIGNEE_ALL);

  const funnelData = useMemo<FunnelRow[]>(() => {
    const f = metrics.funnel;
    return [...f]
      .sort((a, b) => num(a.sort_order) - num(b.sort_order))
      .map((s) => ({
        name: stageChartLabel(s.name),
        code: s.code,
        count: num(s.count),
      }));
  }, [metrics.funnel]);

  const trendData = useMemo(() => mapRpcTrendToChart(metrics.new_per_day_utc_7d), [metrics.new_per_day_utc_7d]);

  const sourceBars = useMemo<FunnelRow[]>(() => {
    const top = metrics.top_source_channels;
    return top.slice(0, 16).map((s) => ({
      name:
        (s.channel || "").length > 28 ? `${String(s.channel).slice(0, 26)}…` : String(s.channel || "—"),
      code: String(s.channel),
      count: num(s.count),
    }));
  }, [metrics.top_source_channels]);

  const taskBreakdown = metrics.task_breakdown_by_assignee;

  useEffect(() => {
    if (taskAssigneeKey === TASK_BY_ASSIGNEE_ALL) return;
    const ok = taskBreakdown.some((r) => r.assignee_key === taskAssigneeKey);
    if (!ok) {
      setTaskAssigneeKey(TASK_BY_ASSIGNEE_ALL);
    }
  }, [taskAssigneeKey, taskBreakdown]);

  const selectedAssigneeSummary = useMemo(() => {
    if (taskAssigneeKey === TASK_BY_ASSIGNEE_ALL) {
      return { label: "Все ответственные", key: TASK_BY_ASSIGNEE_ALL as string };
    }
    const hit = taskBreakdown.find((r) => r.assignee_key === taskAssigneeKey);
    return { label: hit?.label ?? taskAssigneeKey, key: taskAssigneeKey };
  }, [taskAssigneeKey, taskBreakdown]);

  const taskStatusTotalsSelected = useMemo((): Record<TaskStatusCountKey, number> => {
    if (taskAssigneeKey === TASK_BY_ASSIGNEE_ALL) {
      return taskBreakdownTotals(taskBreakdown);
    }
    const row = taskBreakdown.find((r) => r.assignee_key === taskAssigneeKey);
    return row ? rowToStatusTotals(row) : { open: 0, in_progress: 0, done: 0, cancelled: 0 };
  }, [taskAssigneeKey, taskBreakdown]);

  const taskChartBars = useMemo(
    () => taskCountsToFunnelBars(taskStatusTotalsSelected),
    [taskStatusTotalsSelected],
  );

  const total = metrics.total_contacts;
  const newInWeek = metrics.new_contacts_last_7d;
  const stageKinds = metrics.funnel.filter((s) => num(s.count) > 0).length;
  const sla = metrics.sla_first_activity;
  const medianHours = sla?.median_hours_to_activity;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl text-foreground">Дашборд</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ключевые цифры, воронка, источники и приток лидов за неделю
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-hairline bg-surface/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-normal uppercase tracking-[0.2em] text-muted-foreground">
              Всего лидов
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-display text-4xl text-foreground">{total}</p>
          </CardContent>
        </Card>
        <Card className="border-hairline bg-surface/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-normal uppercase tracking-[0.2em] text-muted-foreground">
              Новых за 7 дней
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-display text-4xl text-foreground">{newInWeek}</p>
          </CardContent>
        </Card>
        <Card className="border-hairline bg-surface/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-normal uppercase tracking-[0.2em] text-muted-foreground">
              Этапов с лидами
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-display text-4xl text-foreground">{stageKinds}</p>
          </CardContent>
        </Card>
        <Card className="border-hairline bg-surface/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-normal uppercase tracking-[0.2em] text-muted-foreground">
              До первой активности (медиана)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-display text-4xl text-foreground">
              {medianHours != null ? `${num(medianHours)} ч` : "—"}
            </p>
            <p className="mt-1 text-[10px] text-muted-foreground">
              По лидам за 30 дн. с известным last_activity (N = {num(sla?.cohort_with_activity)}).
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <Card className="border-hairline bg-surface/20">
          <CardHeader className="gap-4 space-y-0">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="font-display text-lg">Лиды по этапам</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">Выберите способ отображения</p>
              </div>
              <ToggleGroup
                type="single"
                value={funnelVariant}
                onValueChange={(v) => v && setFunnelVariant(v as FunnelChartVariant)}
                variant="outline"
                size="sm"
                className="flex-wrap justify-start rounded-md bg-muted/50 p-1"
                aria-label="Тип диаграммы по этапам"
              >
                <ToggleGroupItem value="bar" aria-label="Столбиковая" className="h-9 shrink-0 px-2.5">
                  <ChartColumn className="h-4 w-4" />
                </ToggleGroupItem>
                <ToggleGroupItem value="barHorizontal" aria-label="Рейтинговая" className="h-9 shrink-0 px-2.5">
                  <ChartGantt className="h-4 w-4" />
                </ToggleGroupItem>
                <ToggleGroupItem value="pie" aria-label="Круговая" className="h-9 shrink-0 px-2.5">
                  <PieChartIcon className="h-4 w-4" />
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          </CardHeader>
          <CardContent className="h-[300px] pl-0 pt-4">
            <FunnelChartView variant={funnelVariant} data={funnelData} />
          </CardContent>
        </Card>

        <Card className="border-hairline bg-surface/20">
          <CardHeader className="gap-4 space-y-0">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="font-display text-lg">Новые лиды по дням (7 дней)</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  По UTC-календарным дням (как в базе)
                </p>
              </div>
              <ToggleGroup
                type="single"
                value={trendVariant}
                onValueChange={(v) => v && setTrendVariant(v as TrendChartVariant)}
                variant="outline"
                size="sm"
                className="flex-shrink-0 flex-wrap justify-start rounded-md bg-muted/50 p-1"
                aria-label="Тип графика тренда"
              >
                <ToggleGroupItem value="line" aria-label="Линия" className="h-9 px-2.5">
                  <ChartLine className="h-4 w-4" />
                </ToggleGroupItem>
                <ToggleGroupItem value="bar" aria-label="Столбцы" className="h-9 px-2.5">
                  <ChartColumn className="h-4 w-4" />
                </ToggleGroupItem>
                <ToggleGroupItem value="area" aria-label="Область" className="h-9 px-2.5">
                  <ChartArea className="h-4 w-4" />
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          </CardHeader>
          <CardContent className="h-[300px] pt-4">
            <TrendChartView variant={trendVariant} data={trendData} />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <Card className="border-hairline bg-surface/20">
          <CardHeader>
            <CardTitle className="font-display text-lg">Лиды по UTM source</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Распределение по полю `utm_source`.
            </p>
          </CardHeader>
          <CardContent className="h-[280px] pl-0 pt-2">
            {sourceBars.some((x) => x.count > 0) ? (
              <FunnelChartView variant="barHorizontal" data={sourceBars} />
            ) : (
              <p className="text-sm text-muted-foreground">Нет распределений по источникам.</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-hairline bg-surface/20">
          <CardHeader className="space-y-3 pb-4">
            <div>
              <CardTitle className="font-display text-lg">Задачи по статусам</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                Всего в CRM: <span className="tabular-nums text-foreground">{metrics.tasks_total_all}</span> · активных
                (открыта или в работе):{" "}
                <span className="tabular-nums text-foreground">{metrics.tasks_active_open_progress}</span>
                · с просроком среди них:{" "}
                <span className="tabular-nums text-foreground">{metrics.tasks_overdue_active}</span>.
              </p>
            </div>
            <div className="space-y-2">
              <Label
                htmlFor="dash-task-assignee"
                className="text-[10px] uppercase tracking-wider text-muted-foreground"
              >
                Ответственный
              </Label>
              <Select value={taskAssigneeKey} onValueChange={(v) => setTaskAssigneeKey(v)}>
                <SelectTrigger id="dash-task-assignee" className="max-w-md border-hairline">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TASK_BY_ASSIGNEE_ALL}>Все ответственные</SelectItem>
                  {taskBreakdown.map((row) => (
                    <SelectItem key={row.assignee_key} value={row.assignee_key}>
                      {row.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Столбцы — статусы задач именно для:{" "}
                <span className="font-medium text-foreground">{selectedAssigneeSummary.label}</span>.
              </p>
            </div>
          </CardHeader>
          <CardContent className="h-[300px] pl-0 pb-6 pt-0">
            {taskBreakdown.length === 0 && metrics.tasks_total_all > 0 ? (
              <p className="text-sm text-muted-foreground">
                Сервер без разбивки по ответственным — выполните миграцию{" "}
                <code className="rounded bg-muted px-1 py-px text-[11px]">
                  20260507140000_crm_dashboard_task_by_assignee_status
                </code>
                .
              </p>
            ) : metrics.tasks_total_all <= 0 ? (
              <p className="text-sm text-muted-foreground">Задач в CRM пока нет.</p>
            ) : (
              <FunnelChartView variant="bar" data={taskChartBars} countLabel="Задач" />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function CrmDashboard() {
  const supabase = getSupabase();

  const { data: metricRaw, isLoading: metricsLoading, error: metricErr } = useQuery({
    queryKey: ["crm", "dashboard-metrics"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("crm_dashboard_metrics");
      if (error) throw error;
      return data as unknown;
    },
  });

  if (metricsLoading) {
    return <p className="text-sm text-muted-foreground">Загрузка метрик…</p>;
  }

  if (metricErr) {
    return (
      <p className="text-sm text-destructive">
        Ошибка загрузки: {(metricErr as Error).message}
      </p>
    );
  }

  const metrics = parseDashboardMetrics(metricRaw);
  if (!metrics) {
    return (
      <p className="text-sm text-destructive">
        Ошибка загрузки: пустой или неразборчивый ответ RPC <code className="text-xs">crm_dashboard_metrics</code>.
        Убедитесь, что миграция <code className="text-xs">20260503120000_crm_list_page_and_dashboard_rpc.sql</code>{" "}
        применена в Supabase.
      </p>
    );
  }

  return <CrmDashboardLoaded metrics={metrics} />;
}