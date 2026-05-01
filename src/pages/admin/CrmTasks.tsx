import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { getSupabase } from "@/lib/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { Checkbox } from "@/components/ui/checkbox";
import type { CrmTaskRow, CrmTaskStatus } from "@/types/crm";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";

const OPEN: CrmTaskStatus[] = ["open", "in_progress"];

function statusLabel(s: CrmTaskStatus): string {
  switch (s) {
    case "open":
      return "Открыта";
    case "in_progress":
      return "В работе";
    case "done":
      return "Выполнена";
    case "cancelled":
      return "Отменена";
    default:
      return s;
  }
}

export default function CrmTasks() {
  const supabase = getSupabase();
  const { user } = useAuth();
  const [onlyMine, setOnlyMine] = useState(false);
  const [includeDone, setIncludeDone] = useState(false);

  const { data: tasks = [], isLoading, error } = useQuery({
    queryKey: ["crm", "tasks-all", { onlyMine, includeDone, uid: user?.id }],
    queryFn: async () => {
      let q = supabase.from("crm_tasks").select("*").order("due_at", { ascending: true, nullsFirst: false });

      if (onlyMine && user?.id) {
        q = q.eq("assignee_user_id", user.id);
      }

      if (!includeDone) {
        q = q.in("status", OPEN);
      }

      const { data, error: qe } = await q.limit(500);
      if (qe) throw qe;
      return (data ?? []) as CrmTaskRow[];
    },
  });

  const contactIds = useMemo(() => [...new Set(tasks.map((t) => t.contact_id))], [tasks]);

  const { data: contactNames = {} } = useQuery({
    queryKey: ["crm", "tasks-contact-names", contactIds.slice().sort().join(",")],
    enabled: contactIds.length > 0,
    queryFn: async () => {
      const { data, error: qe } = await supabase
        .from("crm_contacts")
        .select("id, full_name")
        .in("id", contactIds);
      if (qe) throw qe;
      const map: Record<string, string> = {};
      for (const c of data ?? []) {
        const row = c as { id: string; full_name: string | null };
        map[row.id] = row.full_name?.trim() ? row.full_name : `Клиент ${row.id.slice(0, 8)}`;
      }
      return map;
    },
  });

  const sortedTasks = useMemo(() => {
    const list = [...tasks];
    list.sort((a, b) => {
      const da = a.due_at ? parseISO(a.due_at).getTime() : Infinity;
      const db = b.due_at ? parseISO(b.due_at).getTime() : Infinity;
      if (da !== db) return da - db;
      return parseISO(b.created_at).getTime() - parseISO(a.created_at).getTime();
    });
    return list;
  }, [tasks]);

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Загрузка задач…</p>;
  }

  if (error) {
    return <p className="text-sm text-destructive">{(error as Error).message}</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl text-foreground">Задачи</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Задачи по лидам. Создание и смена статуса — в карточке контакта, вкладка «Задачи».
        </p>
      </div>

      <div className="flex flex-wrap gap-6 border-b border-hairline pb-4">
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <Checkbox checked={onlyMine} onCheckedChange={(c) => setOnlyMine(c === true)} />
          Только назначенные на меня
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <Checkbox checked={includeDone} onCheckedChange={(c) => setIncludeDone(c === true)} />
          Показывать выполненные и отменённые
        </label>
      </div>

      {sortedTasks.length === 0 ? (
        <p className="text-sm text-muted-foreground">Нет задач по выбранным условиям.</p>
      ) : (
        <ul className="space-y-3">
          {sortedTasks.map((t) => (
            <li
              key={t.id}
              className="rounded-sm border border-hairline bg-surface/15 px-4 py-3 text-sm transition-colors hover:border-accent/40"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Link
                  to={`/admin/crm/contacts/${t.contact_id}`}
                  className="font-medium text-accent underline-offset-2 hover:underline"
                >
                  {contactNames[t.contact_id] ?? "Контакт"}
                </Link>
                <span className="text-xs text-muted-foreground">{statusLabel(t.status)}</span>
              </div>
              <p className="mt-1 text-foreground">{t.title}</p>
              {t.description ? <p className="mt-1 text-muted-foreground">{t.description}</p> : null}
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {t.due_at ? (
                  <span>
                    Срок: {format(parseISO(t.due_at), "d MMM yyyy HH:mm", { locale: ru })}
                  </span>
                ) : (
                  <span>Срок не задан</span>
                )}
                <span className="uppercase">приоритет: {t.priority}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
