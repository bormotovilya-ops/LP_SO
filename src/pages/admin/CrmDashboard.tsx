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
import { format, subDays, startOfDay, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import type { CrmPipelineStageRow } from "@/types/crm";

type ContactBrief = { id: string; current_stage_id: string | null; created_at: string };

type FunnelChartVariant = "bar" | "barHorizontal" | "line" | "area" | "pie";

type TrendChartVariant = "line" | "bar" | "area";

type FunnelRow = { name: string; code: string; count: number };

function buildLast7DaysSeries(contacts: ContactBrief[]) {
  const days: { key: string; label: string; count: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = startOfDay(subDays(new Date(), i));
    const key = d.toISOString().slice(0, 10);
    days.push({ key, label: format(d, "d MMM", { locale: ru }), count: 0 });
  }
  const byKey = new Map(days.map((d) => [d.key, d]));
  for (const c of contacts) {
    const t = parseISO(c.created_at);
    const k = startOfDay(t).toISOString().slice(0, 10);
    const slot = byKey.get(k);
    if (slot) slot.count += 1;
  }
  return days;
}

const chartTooltipStyles = {
  background: "hsl(var(--background))",
  border: "1px solid hsl(var(--hairline))",
  borderRadius: "4px",
  fontSize: 12,
} as const;

const axisMuted = { fontSize: 10, fill: "hsl(var(--muted-foreground))" };

function funnelPieCellOpacity(index: number, total: number): number {
  if (total <= 1) return 1;
  return 0.35 + ((index % 12) / 12) * 0.55;
}

function FunnelChartView({ variant, data }: { variant: FunnelChartVariant; data: FunnelRow[] }) {
  const accentStroke = "hsl(var(--accent))";
  const accentFillMuted = "hsl(var(--accent) / 0.25)";
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
          >
            {pieRows.map((_, i) => (
              <Cell
                key={pieRows[i].code}
                fill={accentStroke}
                fillOpacity={nonZeroPie.length ? funnelPieCellOpacity(i, pieRows.length) : 0.25}
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

function TrendChartView({ variant, data }: { variant: TrendChartVariant; data: ReturnType<typeof buildLast7DaysSeries> }) {
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

export default function CrmDashboard() {
  const supabase = getSupabase();
  const [funnelVariant, setFunnelVariant] = useState<FunnelChartVariant>("bar");
  const [trendVariant, setTrendVariant] = useState<TrendChartVariant>("line");

  const stagesQuery = useQuery({
    queryKey: ["crm", "pipeline-stages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_pipeline_stages")
        .select("id, code, name, sort_order, is_active")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return data as CrmPipelineStageRow[];
    },
  });

  const contactsQuery = useQuery({
    queryKey: ["crm", "contacts-brief"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_contacts")
        .select("id, current_stage_id, created_at");
      if (error) throw error;
      return (data ?? []) as ContactBrief[];
    },
  });

  const weekAgo = useMemo(() => subDays(new Date(), 7), []);
  const newInWeek = useMemo(() => {
    const list = contactsQuery.data ?? [];
    return list.filter((c) => new Date(c.created_at) >= weekAgo).length;
  }, [contactsQuery.data, weekAgo]);

  const funnelData = useMemo(() => {
    const stages = stagesQuery.data ?? [];
    const contacts = contactsQuery.data ?? [];
    const byStage: Record<string, number> = {};
    for (const s of stages) {
      byStage[s.id] = 0;
    }
    for (const c of contacts) {
      if (c.current_stage_id && byStage[c.current_stage_id] !== undefined) {
        byStage[c.current_stage_id] += 1;
      }
    }
    return stages.map((s) => ({
      name: s.name,
      code: s.code,
      count: byStage[s.id] ?? 0,
    }));
  }, [stagesQuery.data, contactsQuery.data]);

  const trendData = useMemo(() => buildLast7DaysSeries(contactsQuery.data ?? []), [contactsQuery.data]);

  const total = contactsQuery.data?.length ?? 0;

  const isLoading = stagesQuery.isLoading || contactsQuery.isLoading;
  const err = stagesQuery.error || contactsQuery.error;

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Загрузка метрик…</p>;
  }

  if (err) {
    return <p className="text-sm text-destructive">Ошибка загрузки: {(err as Error).message}</p>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl text-foreground">Дашборд</h1>
        <p className="mt-1 text-sm text-muted-foreground">Сводка по воронке и новым лидам</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
        <Card className="border-hairline bg-surface/20 sm:col-span-2 lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-normal uppercase tracking-[0.2em] text-muted-foreground">
              Этапов в воронке
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-display text-4xl text-foreground">{(stagesQuery.data ?? []).length}</p>
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
                <p className="mt-1 text-xs text-muted-foreground">Тренд создания контактов</p>
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
    </div>
  );
}