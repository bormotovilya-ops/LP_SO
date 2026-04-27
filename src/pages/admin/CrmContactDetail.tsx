import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { getSupabase } from "@/lib/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CrmContactRow, CrmPipelineStageRow, CrmProfileRow } from "@/types/crm";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";

type CrmInteractionRow = {
  id: string;
  channel: string;
  direction: "inbound" | "outbound" | "internal";
  interaction_type: string;
  payload: Record<string, unknown>;
  created_at: string;
};

type CrmStageHistoryRow = {
  id: string;
  reason: string;
  note: string | null;
  changed_by: "system" | "manager" | "bot";
  created_at: string;
  to_stage_id: string;
  from_stage_id: string | null;
};

type TimelineEvent = {
  id: string;
  kind: "interaction" | "stage";
  title: string;
  meta: string;
  createdAt: string;
};

function toInputDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  const d = parseISO(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromInputDatetimeLocal(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export default function CrmContactDetail() {
  const { id } = useParams<{ id: string }>();
  const { canWriteCrm } = useAuth();
  const supabase = getSupabase();
  const queryClient = useQueryClient();
  const readOnly = !canWriteCrm;

  const { data: stages } = useQuery({
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

  const { data: managers } = useQuery({
    queryKey: ["crm", "profiles-managers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_profiles")
        .select("id, display_name, role, is_active")
        .eq("is_active", true)
        .in("role", ["admin", "manager"]);
      if (error) throw error;
      return (data ?? []) as CrmProfileRow[];
    },
  });

  const { data: contact, isLoading, error, refetch } = useQuery({
    queryKey: ["crm", "contact", id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error: qe } = await supabase
        .from("crm_contacts")
        .select("*")
        .eq("id", id!)
        .maybeSingle();
      if (qe) throw qe;
      return data as CrmContactRow | null;
    },
  });

  const { data: interactions = [] } = useQuery({
    queryKey: ["crm", "interactions", id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error: qe } = await supabase
        .from("crm_interactions")
        .select("id, channel, direction, interaction_type, payload, created_at")
        .eq("contact_id", id!)
        .order("created_at", { ascending: false })
        .limit(50);
      if (qe) throw qe;
      return (data ?? []) as CrmInteractionRow[];
    },
  });

  const { data: stageHistory = [] } = useQuery({
    queryKey: ["crm", "stage-history", id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error: qe } = await supabase
        .from("crm_contact_stage_history")
        .select("id, reason, note, changed_by, created_at, to_stage_id, from_stage_id")
        .eq("contact_id", id!)
        .order("created_at", { ascending: false })
        .limit(50);
      if (qe) throw qe;
      return (data ?? []) as CrmStageHistoryRow[];
    },
  });

  const currentStageCode = useMemo(() => {
    if (!contact?.current_stage_id || !stages) return "";
    return stages.find((s) => s.id === contact.current_stage_id)?.code ?? "";
  }, [contact, stages]);

  const stageNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of stages ?? []) map.set(s.id, s.name);
    return map;
  }, [stages]);

  const timeline = useMemo<TimelineEvent[]>(() => {
    const fromInteractions: TimelineEvent[] = interactions.map((item) => ({
      id: `interaction-${item.id}`,
      kind: "interaction",
      title: `Событие: ${item.interaction_type}`,
      meta: `${item.channel} · ${item.direction}`,
      createdAt: item.created_at,
    }));
    const fromStages: TimelineEvent[] = stageHistory.map((item) => ({
      id: `stage-${item.id}`,
      kind: "stage",
      title: `Этап: ${stageNameById.get(item.to_stage_id) ?? "Неизвестный этап"}`,
      meta: `${item.changed_by} · ${item.reason}${item.note ? ` · ${item.note}` : ""}`,
      createdAt: item.created_at,
    }));
    return [...fromInteractions, ...fromStages].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [interactions, stageHistory, stageNameById]);

  const [stageCode, setStageCode] = useState("");
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!contact) return;
    setStageCode(currentStageCode);
    setOwnerId(contact.owner_user_id);
    setComment(contact.comment ?? "");
    setNextAction(toInputDatetimeLocal(contact.next_action_at));
    setFullName(contact.full_name ?? "");
    setPhone(contact.phone ?? "");
    setEmail(contact.email ?? "");
  }, [contact, currentStageCode]);

  const handleSave = async () => {
    if (!id || !contact || readOnly) return;
    setSaving(true);
    try {
      if (stageCode && stageCode !== currentStageCode) {
        const { error: re } = await supabase.rpc("crm_change_stage", {
          p_contact_id: id,
          p_to_stage_code: stageCode,
          p_changed_by: "manager",
          p_reason: "crm_ui",
          p_note: "Изменение этапа в CRM",
        });
        if (re) {
          toast.error(re.message);
          setSaving(false);
          return;
        }
      }

      const { error: ue } = await supabase
        .from("crm_contacts")
        .update({
          owner_user_id: ownerId,
          comment: comment || null,
          next_action_at: fromInputDatetimeLocal(nextAction),
          full_name: fullName || null,
          phone: phone || null,
          email: email || null,
        })
        .eq("id", id);
      if (ue) {
        toast.error(ue.message);
        setSaving(false);
        return;
      }
      toast.success("Сохранено");
      await queryClient.invalidateQueries({ queryKey: ["crm", "contacts-list"] });
      await refetch();
    } finally {
      setSaving(false);
    }
  };

  if (!id) {
    return <p className="text-sm text-destructive">Некорректный URL</p>;
  }

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Загрузка…</p>;
  }

  if (error) {
    return <p className="text-sm text-destructive">{(error as Error).message}</p>;
  }

  if (!contact) {
    return (
      <p className="text-sm text-muted-foreground">
        Контакт не найден. <Link to="/admin/crm/contacts">К списку</Link>
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <Link
          to="/admin/crm/contacts"
          className="text-xs uppercase tracking-wider text-muted-foreground transition-colors hover:text-accent"
        >
          ← К контактам
        </Link>
        <h1 className="mt-2 font-display text-3xl text-foreground">{contact.full_name || "Без имени"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Создан: {format(parseISO(contact.created_at), "d MMM yyyy, HH:mm", { locale: ru })}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Источник: {contact.source_channel || "—"} {contact.telegram_id ? `· Telegram ID: ${contact.telegram_id}` : ""}
        </p>
      </div>

      {readOnly ? (
        <p className="rounded-sm border border-hairline bg-surface/30 px-3 py-2 text-sm text-muted-foreground">
          Роль «viewer» — только просмотр.
        </p>
      ) : null}

      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Имя</Label>
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="border-hairline"
              disabled={readOnly}
            />
          </div>
          <div className="space-y-2">
            <Label>Телефон</Label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="border-hairline"
              disabled={readOnly}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Email</Label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="border-hairline"
            disabled={readOnly}
          />
        </div>

        <div className="space-y-2">
          <Label>Этап воронки</Label>
          <Select value={stageCode} onValueChange={setStageCode} disabled={readOnly}>
            <SelectTrigger className="border-hairline">
              <SelectValue placeholder="Этап" />
            </SelectTrigger>
            <SelectContent>
              {(stages ?? []).map((s) => (
                <SelectItem key={s.id} value={s.code}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Ответственный</Label>
          <Select
            value={ownerId ?? "__none__"}
            onValueChange={(v) => setOwnerId(v === "__none__" ? null : v)}
            disabled={readOnly}
          >
            <SelectTrigger className="border-hairline">
              <SelectValue placeholder="Не назначен" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Не назначен</SelectItem>
              {(managers ?? []).map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.display_name || m.id.slice(0, 8)} ({m.role})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Следующее действие</Label>
          <Input
            type="datetime-local"
            value={nextAction}
            onChange={(e) => setNextAction(e.target.value)}
            className="border-hairline"
            disabled={readOnly}
          />
        </div>

        <div className="space-y-2">
          <Label>Комментарий</Label>
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="min-h-[100px] border-hairline"
            disabled={readOnly}
          />
        </div>

        {readOnly ? null : (
          <Button type="button" onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
            {saving ? "Сохранение…" : "Сохранить"}
          </Button>
        )}
      </div>

      <div className="space-y-3">
        <h2 className="font-display text-xl text-foreground">История активности</h2>
        {timeline.length === 0 ? (
          <p className="text-sm text-muted-foreground">Пока нет событий по этому лиду.</p>
        ) : (
          <div className="space-y-2">
            {timeline.map((event) => (
              <div key={event.id} className="rounded-sm border border-hairline bg-surface/20 px-3 py-2">
                <p className="text-sm text-foreground">{event.title}</p>
                <p className="text-xs text-muted-foreground">{event.meta}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {format(parseISO(event.createdAt), "d MMM yyyy, HH:mm", { locale: ru })}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
