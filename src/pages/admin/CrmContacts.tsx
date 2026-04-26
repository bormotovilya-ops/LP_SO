import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { getSupabase } from "@/lib/supabaseClient";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { CrmContactRow, CrmPipelineStageRow } from "@/types/crm";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";

export default function CrmContacts() {
  const supabase = getSupabase();

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
        .select("id, full_name, phone, email, source_channel, current_stage_id, last_activity_at, created_at")
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

  if (sLoading || isLoading) {
    return <p className="text-sm text-muted-foreground">Загрузка…</p>;
  }

  if (error || sErr) {
    return <p className="text-sm text-destructive">Ошибка: {(error ?? sErr)!.message}</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl text-foreground">Контакты</h1>
        <p className="mt-1 text-sm text-muted-foreground">Список лидов, сортировка по последней активности</p>
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
            {(contacts ?? []).map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  <Link
                    to={`/admin/crm/contacts/${c.id}`}
                    className="font-medium text-accent underline-offset-2 hover:underline"
                  >
                    {c.full_name || "—"}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">{c.phone || "—"}</TableCell>
                <TableCell className="text-muted-foreground">{c.email || "—"}</TableCell>
                <TableCell className="text-sm">{c.source_channel}</TableCell>
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
            {(contacts ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  Пока нет лидов
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
