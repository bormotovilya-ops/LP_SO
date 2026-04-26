import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getSupabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format, subDays, startOfDay, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import type { CrmPipelineStageRow } from "@/types/crm";

type ContactBrief = { id: string; current_stage_id: string | null; created_at: string };

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

export default function CrmDashboard() {
  const supabase = getSupabase();

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

  const trendData = useMemo(
    () => buildLast7DaysSeries(contactsQuery.data ?? []),
    [contactsQuery.data],
  );

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
          <CardHeader>
            <CardTitle className="font-display text-lg">Лиды по этапам</CardTitle>
          </CardHeader>
          <CardContent className="h-[280px] pl-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={funnelData} margin={{ top: 8, right: 8, left: 8, bottom: 32 }}>
                <CartesianGrid stroke="hsl(var(--hairline))" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  interval={0}
                  angle={-18}
                  textAnchor="end"
                  height={64}
                />
                <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--background))",
                    border: "1px solid hsl(var(--hairline))",
                    borderRadius: "4px",
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="count" fill="hsl(var(--accent))" radius={[2, 2, 0, 0]} name="Лидов" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-hairline bg-surface/20">
          <CardHeader>
            <CardTitle className="font-display text-lg">Новые лиды по дням (7 дней)</CardTitle>
          </CardHeader>
          <CardContent className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="hsl(var(--hairline))" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--background))",
                    border: "1px solid hsl(var(--hairline))",
                    borderRadius: "4px",
                    fontSize: 12,
                  }}
                />
                <Line type="monotone" dataKey="count" stroke="hsl(var(--accent))" strokeWidth={2} dot name="Новых" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
