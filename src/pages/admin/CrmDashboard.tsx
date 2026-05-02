import { useMemo, useState } from "react";
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
import { ChartArea, ChartColumn, ChartGantt, ChartLine, CircleDashed } from "lucide-react";
import { getSupabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type FunnelChartVariant = "bar" | "barHorizontal" | "line" | "area" | "pie";

type TrendChartVariant = "line" | "bar" | "area";

type FunnelRow = { name: string; code: string; count: number };

type TrendDatum = { label: string; count: number };

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
  stage_conversion: Array<{
    code: string;
    name: string;
    sort_order: number;
    count: number | string;
    pct_of_previous: number | string | null;
  }>;
  top_source_channels: Array<{ channel: string; count: number | string }>;
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
    stage_conversion: Array.isArray(o.stage_conversion)
      ? (o.stage_conversion as DashboardMetrics["stage_conversion"])
      : [],
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
  };
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

function FunnelChartView({ variant, data }: { variant: FunnelChartVariant; data: FunnelRow[] }) {
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
          <Tooltip contentStyle={chartTooltipStyles} formatter={(v: number) => [`${v}`, "Лидов"]} />
          <Bar dataKey="count" fill={accentStroke} radius={[0, 2, 2, 0]} name="Лидов" />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (variant === "line") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 32 }}>
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
          <Tooltip contentStyle={chartTooltipStyles} />
          <Line
            type="monotone"
            dataKey="count"
            stroke={accentStroke}
            strokeWidth={2}
            dot={{ r: 2, fill: accentStroke }}
            name="Лидов"
          />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  if (variant === "area") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 32 }}>
          <CartesianGrid stroke="hsl(var(--hairline))" vertical={false} />
          <defs>
            <linearGradient id="funnelAreaFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={accentStroke} stopOpacity={0.35} />
              <stop offset="100%" stopColor={accentStroke} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="name"
            tick={axisMuted}
            interval={0}
            angle={-18}
            textAnchor="end"
            height={64}
          />
          <YAxis allowDecimals={false} tick={axisMuted} />
          <Tooltip contentStyle={chartTooltipStyles} />
          <Area
            type="monotone"
            dataKey="count"
            stroke={accentStroke}
            strokeWidth={2}
            fill="url(#funnelAreaFill)"
            name="Лидов"
          />
        </AreaChart>
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
        <Tooltip contentStyle={chartTooltipStyles} />
        <Bar dataKey="count" fill={accentStroke} radius={[2, 2, 0, 0]} name="Лидов" />
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

  const total = metrics.total_contacts;
  const newInWeek = metrics.new_contacts_last_7d;
  const stageKinds = metrics.funnel.filter((s) => num(s.count) > 0).length;
  const sla = metrics.sla_first_activity;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl text-foreground">Дашборд</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Воронка, источники, конверсия между этапами и SLA-прокси по первой активности (последние 30 дней)
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
              SLA: ≤24 ч до активности*
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-display text-4xl text-foreground">
              {sla?.pct_within_24h != null ? `${num(sla.pct_within_24h)}%` : "—"}
            </p>
            <p className="mt-1 text-[10px] text-muted-foreground">
              Лиды 30 дн. с признаком last_activity ({num(sla?.cohort_with_activity)} шт.).
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
                <ToggleGroupItem value="bar" aria-label="Столбцы" className="h-9 shrink-0 px-2.5">
                  <ChartColumn className="h-4 w-4" />
                </ToggleGroupItem>
                <ToggleGroupItem value="barHorizontal" aria-label="Горизонтально" className="h-9 shrink-0 px-2.5">
                  <ChartGantt className="h-4 w-4" />
                </ToggleGroupItem>
                <ToggleGroupItem value="line" aria-label="Линия" className="h-9 shrink-0 px-2.5">
                  <ChartLine className="h-4 w-4" />
                </ToggleGroupItem>
                <ToggleGroupItem value="area" aria-label="Область" className="h-9 shrink-0 px-2.5">
                  <ChartArea className="h-4 w-4" />
                </ToggleGroupItem>
                <ToggleGroupItem value="pie" aria-label="Кольцевая долями" className="h-9 shrink-0 px-2.5">
                  <CircleDashed className="h-4 w-4" />
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
            <CardTitle className="font-display text-lg">Лиды по каналам (источники)</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Уникальных значений source_channel (до 16 на экране, полный топ в данных).
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
          <CardHeader>
            <CardTitle className="font-display text-lg">Конверсия к предыдущему этапу воронки</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Доля лидов на этапе относительно предыдущего по порядку sort_order. Первый этап — без доли.
            </p>
          </CardHeader>
          <CardContent className="overflow-x-auto px-2 pt-2">
            <Table>
              <TableHeader>
                <TableRow className="border-hairline">
                  <TableHead className="text-xs uppercase tracking-wider">Этап</TableHead>
                  <TableHead className="text-right text-xs uppercase tracking-wider">Лидов</TableHead>
                  <TableHead className="text-right text-xs uppercase tracking-wider">К пред.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {metrics.stage_conversion.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-muted-foreground">
                      Нет данных воронки
                    </TableCell>
                  </TableRow>
                ) : (
                  metrics.stage_conversion
                    .slice()
                    .sort((a, b) => num(a.sort_order) - num(b.sort_order))
                    .map((row) => (
                      <TableRow key={row.code} className="border-hairline">
                        <TableCell className="max-w-[200px] text-sm">{row.name}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm">{num(row.count)}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                          {row.pct_of_previous == null ? "—" : `${num(row.pct_of_previous)}%`}
                        </TableCell>
                      </TableRow>
                    ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card className="border-hairline bg-surface/20">
        <CardHeader className="pb-2">
          <CardTitle className="font-display text-lg text-foreground">
            SLA-прокси: время до первой активности*
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Считается по лидам за последние 30 дней, у которых заполнены и created_at и last_activity_at.
            Первая активность здесь трактуется через поле last_activity_at (нет разбора отдельных касаний).
          </p>
          <p>
            Доля лидов, у которых первая зафиксированная активность наступила в течение 24 часов после создания:{" "}
            <strong className="text-foreground">
              {sla?.pct_within_24h != null ? `${num(sla.pct_within_24h)}%` : "—"}
            </strong>
            . Медиана часов от создания до этой активности:{" "}
            <strong className="text-foreground">
              {sla?.median_hours_to_activity != null ? `${num(sla.median_hours_to_activity)} ч` : "—"}
            </strong>{" "}
            (выборка: {num(sla?.cohort_with_activity)} контактов).
          </p>
        </CardContent>
      </Card>
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