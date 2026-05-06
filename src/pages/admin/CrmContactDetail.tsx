import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { getSupabase } from "@/lib/supabaseClient";
import { functionsApiUrl, supabaseFunctionsInvokeHeaders } from "@/lib/functionsApi";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  CrmContactRow,
  CrmPipelineStageRow,
  CrmProfileRow,
  CrmTaskPriority,
  CrmTaskRow,
  CrmTaskStatus,
  LeadTemperature,
} from "@/types/crm";
import {
  CRM_FUNNEL_SELECT_UNRESOLVED_SENTINEL,
  resolveCrmFunnelSelectValue,
} from "@/lib/crmFunnelSelect";
import {
  adminLeadSourceSelectOptions,
  crmLeadSourceLabel,
  normalizeCrmLeadSourceCode,
  sourceChannelAdminSelectValue,
} from "@/lib/crmLeadSources";
import {
  normalizeTelegramUsername,
  telegramAppOpenMessageUrl,
  telegramMeProfileUrlFromUsername,
  telegramWebKChatUrl,
} from "@/lib/telegramLeadChatLinks";
import { cn } from "@/lib/utils";
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

/** Достаточно строк для истории без обрезки воронки. */
const CRM_HISTORY_FETCH_LIMIT = 5000;

function interactionBodyFromPayload(payload: Record<string, unknown>): string | null {
  const summary = typeof payload.summary === "string" ? payload.summary.trim() : "";
  if (summary) return summary;
  const raw =
    (typeof payload.body === "string" && payload.body) ||
    (typeof payload.note === "string" && payload.note) ||
    (typeof payload.text === "string" && payload.text) ||
    (typeof payload.message === "string" && payload.message) ||
    "";
  const t = raw.trim();
  return t ? t : null;
}

/** Подпись типа события в ленте (остальные — как в БД, через подчёркивания). */
function crmInteractionTypeLabel(type: string): string {
  const map: Record<string, string> = {
    gift_received: "Подарок получен в боте",
    bot_start: "Старт сценария в Telegram",
    manual_note: "Заметка",
    lead_capture: "Лид с сайта",
    quiz_review_requested: "Анкета после квиза",
    quiz_completed: "Заявка после квиза (сайт)",
    diagnostic_request_submitted: "Заявка с формы",
    outbound_practices_collection_file: "Выдача сборника практик",
    practices_collection_paid: "Оплата сборника практик",
  };
  return map[type] ?? type.replaceAll("_", " ");
}

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

function parseTelegramIdForUpdate(raw: string): { ok: true; value: number | null } | { ok: false; message: string } {
  const t = raw.trim();
  if (!t) return { ok: true, value: null };
  if (!/^\d+$/.test(t)) {
    return { ok: false, message: "Telegram ID должен содержать только цифры" };
  }
  const n = Number(t);
  if (!Number.isSafeInteger(n)) {
    return { ok: false, message: "Слишком большой Telegram ID для сохранения в CRM" };
  }
  return { ok: true, value: n };
}

export default function CrmContactDetail() {
  const { id } = useParams<{ id: string }>();
  const { canWriteCrm, isCrmAdmin, user } = useAuth();
  const supabase = getSupabase();
  const queryClient = useQueryClient();
  const readOnly = !canWriteCrm;

  const {
    data: stages,
    isLoading: stagesLoading,
    isError: stagesIsError,
    error: stagesQueryError,
  } = useQuery({
    queryKey: ["crm", "pipeline-stages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_pipeline_stages")
        .select("id, code, name, sort_order")
        .eq("is_active", true)
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
        .limit(CRM_HISTORY_FETCH_LIMIT);
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
        .limit(CRM_HISTORY_FETCH_LIMIT);
      if (qe) throw qe;
      return (data ?? []) as CrmStageHistoryRow[];
    },
  });

  const { data: contactTasks = [], refetch: refetchTasks } = useQuery({
    queryKey: ["crm", "tasks", id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error: qe } = await supabase
        .from("crm_tasks")
        .select("*")
        .eq("contact_id", id!)
        .order("due_at", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false });
      if (qe) throw qe;
      return (data ?? []) as CrmTaskRow[];
    },
  });

  /** Хронология этапов: от старых к новым для чтения «сверху вниз». */
  const stageHistoryChronological = useMemo(
    () => [...stageHistory].sort((a, b) => (a.created_at > b.created_at ? 1 : -1)),
    [stageHistory],
  );

  const currentStageCode = useMemo(() => {
    if (!contact?.current_stage_id) return "";
    const list = stages ?? [];
    return list.find((s) => s.id === contact.current_stage_id)?.code ?? "";
  }, [contact?.current_stage_id, stages]);

  const stageNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of stages ?? []) map.set(s.id, s.name);
    return map;
  }, [stages]);

  const currentStageDisplayName = useMemo(() => {
    if (!contact?.current_stage_id) return null;
    return stageNameById.get(contact.current_stage_id) ?? null;
  }, [contact?.current_stage_id, stageNameById]);

  /** Свежая запись о выдаче подарка (интеракции новее сверху). */
  const latestGiftReceivedSummary = useMemo(() => {
    const row = interactions.find((i) => i.interaction_type === "gift_received");
    if (!row) return null;
    return {
      at: row.created_at,
      line: interactionBodyFromPayload(row.payload),
    };
  }, [interactions]);

  const telegramPublicHandle = useMemo(
    () => normalizeTelegramUsername(contact?.telegram_username ?? null),
    [contact?.telegram_username],
  );
  const telegramProfileHref = useMemo(
    () => telegramMeProfileUrlFromUsername(contact?.telegram_username),
    [contact?.telegram_username],
  );

  /** Radix Select не допускает value="" и требует совпадения с SelectItem. */
  const stageCodes = useMemo(() => new Set((stages ?? []).map((s) => s.code)), [stages]);

  const [stageCode, setStageCode] = useState("");
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [giftReceived, setGiftReceived] = useState(false);
  const [saving, setSaving] = useState(false);
  const [stageChangeNote, setStageChangeNote] = useState("");
  const [timelineNote, setTimelineNote] = useState("");
  const [addingNote, setAddingNote] = useState(false);
  const [telegramMessage, setTelegramMessage] = useState("");
  const [sendingTelegramMessage, setSendingTelegramMessage] = useState(false);

  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskDue, setTaskDue] = useState("");
  const [taskPriority, setTaskPriority] = useState<CrmTaskPriority>("medium");
  const [taskAssigneeId, setTaskAssigneeId] = useState<string | null>(null);
  const [addingTask, setAddingTask] = useState(false);

  const [adminSourceDetail, setAdminSourceDetail] = useState("");
  const [adminUtmSource, setAdminUtmSource] = useState("");
  const [adminUtmMedium, setAdminUtmMedium] = useState("");
  const [adminUtmCampaign, setAdminUtmCampaign] = useState("");
  const [adminUtmContent, setAdminUtmContent] = useState("");
  const [adminUtmTerm, setAdminUtmTerm] = useState("");
  const [adminSegment, setAdminSegment] = useState("");
  const [adminSourceChannel, setAdminSourceChannel] = useState("");
  const [adminLeadTemperature, setAdminLeadTemperature] = useState<LeadTemperature>("cold");
  const [adminTelegramId, setAdminTelegramId] = useState("");
  const [adminIsDuplicate, setAdminIsDuplicate] = useState(false);
  const [adminConsent, setAdminConsent] = useState(false);

  const funnelSelectValue = useMemo(
    () => resolveCrmFunnelSelectValue(stageCode, stageCodes),
    [stageCode, stageCodes],
  );

  const leadSourceSelectOptions = useMemo(
    () => adminLeadSourceSelectOptions(contact?.source_channel),
    [contact?.source_channel],
  );

  useEffect(() => {
    if (user?.id) {
      setTaskAssigneeId((prev) => (prev === null ? user.id : prev));
    }
  }, [user?.id]);

  useEffect(() => {
    if (!contact) return;
    setStageCode(currentStageCode);
    setOwnerId(contact.owner_user_id);
    setComment(contact.comment ?? "");
    setNextAction(toInputDatetimeLocal(contact.next_action_at));
    setFullName(contact.full_name ?? "");
    setPhone(contact.phone ?? "");
    setEmail(contact.email ?? "");
    setGiftReceived(Boolean(contact.gift_received));
    setAdminSourceDetail(contact.source_detail ?? "");
    setAdminUtmSource(contact.utm_source ?? "");
    setAdminUtmMedium(contact.utm_medium ?? "");
    setAdminUtmCampaign(contact.utm_campaign ?? "");
    setAdminUtmContent(contact.utm_content ?? "");
    setAdminUtmTerm(contact.utm_term ?? "");
    setAdminSegment(contact.segment ?? "");
    setAdminSourceChannel(sourceChannelAdminSelectValue(contact.source_channel));
    setAdminLeadTemperature((contact.lead_temperature as LeadTemperature) ?? "cold");
    setAdminTelegramId(contact.telegram_id != null ? String(contact.telegram_id) : "");
    setAdminIsDuplicate(contact.is_duplicate ?? false);
    setAdminConsent(contact.consent_personal_data ?? false);
  }, [contact, currentStageCode]);

  const handleSave = async () => {
    if (!id || !contact || readOnly) return;
    setSaving(true);
    try {
      let parsedTelegram: number | null | undefined;
      if (isCrmAdmin) {
        const tg = parseTelegramIdForUpdate(adminTelegramId);
        if (!tg.ok) {
          toast.error(tg.message);
          setSaving(false);
          return;
        }
        parsedTelegram = tg.value;
      }

      if (stageCode && stageCode !== currentStageCode) {
        const noteTrim = stageChangeNote.trim();
        const { error: re } = await supabase.rpc("crm_change_stage", {
          p_contact_id: id,
          p_to_stage_code: stageCode,
          p_changed_by: "manager",
          p_reason: "crm_ui",
          p_note: noteTrim || "Изменение этапа в CRM",
        });
        if (re) {
          toast.error(re.message);
          setSaving(false);
          return;
        }
      }

      const basePayload = {
        owner_user_id: ownerId,
        comment: comment || null,
        next_action_at: fromInputDatetimeLocal(nextAction),
        full_name: fullName || null,
        phone: phone || null,
        email: email || null,
        gift_received: giftReceived,
      };

      const adminPayload = isCrmAdmin
        ? {
            source_channel: adminSourceChannel.trim() || normalizeCrmLeadSourceCode(contact.source_channel),
            source_detail: adminSourceDetail.trim() || null,
            utm_source: adminUtmSource.trim() || null,
            utm_medium: adminUtmMedium.trim() || null,
            utm_campaign: adminUtmCampaign.trim() || null,
            utm_content: adminUtmContent.trim() || null,
            utm_term: adminUtmTerm.trim() || null,
            segment: adminSegment.trim() || null,
            lead_temperature: adminLeadTemperature,
            is_duplicate: adminIsDuplicate,
            consent_personal_data: adminConsent,
            telegram_id: parsedTelegram,
          }
        : {};

      const { error: ue } = await supabase
        .from("crm_contacts")
        .update({ ...basePayload, ...adminPayload })
        .eq("id", id);
      if (ue) {
        toast.error(ue.message);
        setSaving(false);
        return;
      }
      toast.success("Сохранено");
      if (stageCode && stageCode !== currentStageCode) {
        setStageChangeNote("");
      }
      await queryClient.invalidateQueries({ queryKey: ["crm", "contacts-page"] });
      await queryClient.invalidateQueries({ queryKey: ["crm", "contacts-meta"] });
      await queryClient.invalidateQueries({ queryKey: ["crm", "dashboard-metrics"] });
      await queryClient.invalidateQueries({ queryKey: ["crm", "stage-history", id] });
      await queryClient.invalidateQueries({ queryKey: ["crm", "interactions", id] });
      await refetch();
    } finally {
      setSaving(false);
    }
  };

  const handleAddTimelineNote = async () => {
    if (!id || readOnly) return;
    const body = timelineNote.trim();
    if (!body) {
      toast.error("Введите текст заметки");
      return;
    }
    setAddingNote(true);
    try {
      const actor = isCrmAdmin ? "admin" : "manager";
      const { error: ne } = await supabase.rpc("crm_add_interaction", {
        p_contact_id: id,
        p_channel: "crm_ui",
        p_direction: "internal",
        p_interaction_type: "manual_note",
        p_payload: { body, author_role: actor },
      });
      if (ne) {
        toast.error(ne.message);
        return;
      }
      setTimelineNote("");
      toast.success("Заметка добавлена в ленту");
      await queryClient.invalidateQueries({ queryKey: ["crm", "interactions", id] });
      await queryClient.invalidateQueries({ queryKey: ["crm", "contacts-page"] });
      await queryClient.invalidateQueries({ queryKey: ["crm", "contacts-meta"] });
      await queryClient.invalidateQueries({ queryKey: ["crm", "dashboard-metrics"] });
      await refetch();
    } finally {
      setAddingNote(false);
    }
  };

  const canSendTelegramViaId = Boolean(contact?.telegram_id != null && !telegramPublicHandle && !readOnly);

  const handleSendTelegramMessage = async () => {
    if (!id || !contact?.telegram_id || readOnly) return;
    const text = telegramMessage.trim();
    if (!text) {
      toast.error("Введите текст сообщения");
      return;
    }
    setSendingTelegramMessage(true);
    try {
      const res = await fetch(functionsApiUrl("/crm-contact-send-message"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(supabaseFunctionsInvokeHeaders() as Record<string, string>),
        },
        body: JSON.stringify({
          contactId: id,
          telegramId: contact.telegram_id,
          text,
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string; details?: string };
      if (!res.ok) {
        toast.error(payload.details ? `${payload.error ?? "Ошибка отправки"}: ${payload.details}` : payload.error ?? "Ошибка отправки");
        return;
      }
      setTelegramMessage("");
      toast.success("Сообщение отправлено в Telegram");
      await queryClient.invalidateQueries({ queryKey: ["crm", "interactions", id] });
      await refetch();
    } finally {
      setSendingTelegramMessage(false);
    }
  };

  const handleAddTask = async () => {
    if (!id || readOnly) return;
    const title = taskTitle.trim();
    if (!title) {
      toast.error("Введите заголовок задачи");
      return;
    }
    setAddingTask(true);
    try {
      const { error: insErr } = await supabase.from("crm_tasks").insert({
        contact_id: id,
        title,
        description: taskDescription.trim() || null,
        due_at: fromInputDatetimeLocal(taskDue),
        priority: taskPriority,
        assignee_user_id: taskAssigneeId,
        created_by: user?.id ?? null,
        status: "open",
      });
      if (insErr) {
        toast.error(insErr.message);
        return;
      }
      setTaskTitle("");
      setTaskDescription("");
      setTaskDue("");
      setTaskPriority("medium");
      toast.success("Задача добавлена");
      await queryClient.invalidateQueries({ queryKey: ["crm", "tasks", id] });
      await queryClient.invalidateQueries({ queryKey: ["crm", "tasks-all"] });
      await refetchTasks();
    } finally {
      setAddingTask(false);
    }
  };

  const patchTaskStatus = async (taskId: string, status: CrmTaskStatus) => {
    if (readOnly) return;
    const { error: upErr } = await supabase.from("crm_tasks").update({ status }).eq("id", taskId);
    if (upErr) {
      toast.error(upErr.message);
      return;
    }
    toast.success("Статус задачи обновлён");
    await queryClient.invalidateQueries({ queryKey: ["crm", "tasks", id] });
    await queryClient.invalidateQueries({ queryKey: ["crm", "tasks-all"] });
    await refetchTasks();
  };

  if (!id) {
    return <p className="text-sm text-destructive">Некорректный URL</p>;
  }

  if (isLoading || stagesLoading) {
    return <p className="text-sm text-muted-foreground">Загрузка…</p>;
  }

  if (error) {
    return <p className="text-sm text-destructive">{(error as Error).message}</p>;
  }

  if (stagesIsError) {
    return (
      <p className="text-sm text-destructive">
        Этапы воронки: {(stagesQueryError as Error)?.message ?? "ошибка загрузки"}
      </p>
    );
  }

  if (!contact) {
    return (
      <p className="text-sm text-muted-foreground">
        Контакт не найден. <Link to="/admin/crm/contacts">К списку</Link>
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <Link
          to="/admin/crm/contacts"
          className="text-xs uppercase tracking-wider text-muted-foreground transition-colors hover:text-accent"
        >
          ← К контактам
        </Link>
        <h1 className="mt-2 font-display text-3xl text-foreground">{contact.full_name || "Без имени"}</h1>
        {currentStageDisplayName ? (
          <p className="mt-2 text-sm text-foreground">
            <span className="mr-2 rounded-sm border border-accent/50 bg-accent/10 px-2 py-1 font-medium text-accent">
              Текущий этап: {currentStageDisplayName}
            </span>
            <span className="text-muted-foreground">({stageHistory.length} записей в истории этапов)</span>
          </p>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">Этап не назначен</p>
        )}
        <p className="mt-1 text-sm text-muted-foreground">
          Создан: {format(parseISO(contact.created_at), "d MMM yyyy, HH:mm", { locale: ru })}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Источник: {crmLeadSourceLabel(contact.source_channel)}
          {contact.telegram_id != null || telegramPublicHandle ? (
            <>
              {" · "}
              {telegramProfileHref ? (
                <>
                  <a
                    href={telegramProfileHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent underline-offset-2 hover:underline"
                    title="Открыть профиль / чат в Telegram (t.me)"
                  >
                    @{telegramPublicHandle}
                  </a>
                  {contact.telegram_id != null ? <span className="text-muted-foreground"> · </span> : null}
                </>
              ) : null}
              {contact.telegram_id != null ? (
                <>
                  <span className="tabular-nums">Telegram ID: {contact.telegram_id}</span>
                  {" · "}
                  <a
                    href={telegramWebKChatUrl(contact.telegram_id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent underline-offset-2 hover:underline"
                    title="Открыть диалог в браузере (Telegram Web)"
                  >
                    Веб-версия
                  </a>
                  <span className="text-muted-foreground"> · </span>
                  <a
                    href={telegramAppOpenMessageUrl(contact.telegram_id)}
                    className="text-accent underline-offset-2 hover:underline"
                    title="Открыть в установленном Telegram (tg://openmessage)"
                  >
                    Приложение
                  </a>
                </>
              ) : null}
            </>
          ) : null}
        </p>
        {contact.telegram_id != null && !telegramPublicHandle ? (
          <div className="mt-3 rounded-sm border border-accent/35 bg-accent/5 px-3 py-2 text-xs text-foreground">
            Username Telegram не указан. Связь с контактом доступна через telegram_id и отправку сообщения ботом.
          </div>
        ) : null}
        {contact.gift_received === true ? (
          <div className="mt-3 rounded-sm border border-accent/35 bg-accent/5 px-3 py-2 text-sm text-foreground">
            <p className="font-medium text-accent">Подарок получен</p>
            {latestGiftReceivedSummary?.line ? (
              <p className="mt-0.5 leading-snug text-foreground/90">{latestGiftReceivedSummary.line}</p>
            ) : (
              <p className="mt-0.5 text-xs text-muted-foreground">Флаг установлен автоматически при выдаче в боте или вручную в CRM.</p>
            )}
            {latestGiftReceivedSummary ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Событие в ленте: {format(parseISO(latestGiftReceivedSummary.at), "d MMMM yyyy, HH:mm", { locale: ru })}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      {readOnly ? (
        <p className="rounded-sm border border-hairline bg-surface/30 px-3 py-2 text-sm text-muted-foreground">
          Роль «viewer» — только просмотр.
        </p>
      ) : null}

      <Tabs defaultValue="main" className="w-full">
        <TabsList className="mb-1 flex h-auto min-h-10 w-full flex-wrap justify-start gap-1 rounded-md bg-muted p-1 sm:w-auto">
          <TabsTrigger value="main">Основное</TabsTrigger>
          {isCrmAdmin ? <TabsTrigger value="source">Источник · UTM</TabsTrigger> : null}
          <TabsTrigger value="pipeline" className="gap-1">
            Воронка
            <span className="rounded-sm bg-background/70 px-1 py-px text-[10px] font-normal tabular-nums text-muted-foreground">
              {stageHistory.length}
            </span>
          </TabsTrigger>
          <TabsTrigger value="tasks" className="gap-1">
            Задачи
            <span className="rounded-sm bg-background/70 px-1 py-px text-[10px] font-normal tabular-nums text-muted-foreground">
              {contactTasks.length}
            </span>
          </TabsTrigger>
          <TabsTrigger value="activity" className="gap-1">
            Лента
            <span className="rounded-sm bg-background/70 px-1 py-px text-[10px] font-normal tabular-nums text-muted-foreground">
              {interactions.length}
            </span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="main" forceMount className="mt-6 space-y-4 outline-none data-[state=inactive]:hidden">
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
          <label
            className={cn(
              "flex cursor-pointer items-center gap-2 rounded-sm border border-hairline bg-surface/20 px-3 py-2.5 text-sm sm:col-span-2",
              readOnly && "cursor-default opacity-80",
            )}
          >
            <Checkbox
              checked={giftReceived}
              onCheckedChange={(c) => setGiftReceived(c === true)}
              disabled={readOnly}
            />
            <span>Подарок получен (медитация из Telegram-бота)</span>
          </label>

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
            <Select
              value={funnelSelectValue}
              onValueChange={(v) => {
                if (v === CRM_FUNNEL_SELECT_UNRESOLVED_SENTINEL) return;
                setStageCode(v);
              }}
              disabled={readOnly}
            >
              <SelectTrigger className="border-hairline">
                <SelectValue placeholder="Этап" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={CRM_FUNNEL_SELECT_UNRESOLVED_SENTINEL} disabled className="text-muted-foreground">
                  {stageCode ? "Этап не найден в справочнике — выберите новый" : "Выберите этап"}
                </SelectItem>
                {(stages ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.code}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Комментарий к смене этапа (попадёт в историю)</Label>
            <Textarea
              value={stageChangeNote}
              onChange={(e) => setStageChangeNote(e.target.value)}
              placeholder="Если меняете этап — опишите причину. Необязательно: по умолчанию будет стандартная пометка."
              className="min-h-[72px] border-hairline"
              disabled={readOnly}
            />
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

          {contact.telegram_id != null && !telegramPublicHandle ? (
            <div className="space-y-2 rounded-sm border border-hairline bg-surface/10 p-3">
              <Label>Сообщение в Telegram по ID</Label>
              <Textarea
                value={telegramMessage}
                onChange={(e) => setTelegramMessage(e.target.value)}
                placeholder={`Отправка через бота на Telegram ID ${contact.telegram_id}`}
                className="min-h-[88px] border-hairline"
                disabled={!canSendTelegramViaId || sendingTelegramMessage}
              />
              <Button
                type="button"
                variant="secondary"
                onClick={handleSendTelegramMessage}
                disabled={!canSendTelegramViaId || sendingTelegramMessage}
              >
                {sendingTelegramMessage ? "Отправка…" : "Отправить сообщение"}
              </Button>
            </div>
          ) : null}

          {readOnly ? null : (
            <Button type="button" onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
              {saving ? "Сохранение…" : "Сохранить"}
            </Button>
          )}
        </TabsContent>

        {isCrmAdmin ? (
          <TabsContent value="source" forceMount className="mt-6 space-y-4 outline-none data-[state=inactive]:hidden">
            <div className="space-y-4 rounded-sm border border-hairline bg-surface/15 p-4">
              <div>
                <h3 className="font-display text-lg text-foreground">Источник и технические поля</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Канал, UTM, сегмент, Telegram ID и прочее. «Сохранить» на этой вкладке или «Основное» сохранит оба набора полей одним действием.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label>Источник лида</Label>
                  <Select
                    value={adminSourceChannel}
                    onValueChange={(v) => setAdminSourceChannel(v)}
                    disabled={readOnly}
                  >
                    <SelectTrigger className="border-hairline">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {leadSourceSelectOptions.map(({ value, label }) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Детализация источника</Label>
                  <Input
                    value={adminSourceDetail}
                    onChange={(e) => setAdminSourceDetail(e.target.value)}
                    className="border-hairline"
                    disabled={readOnly}
                  />
                </div>
                <div className="space-y-2">
                  <Label>UTM source</Label>
                  <Input
                    value={adminUtmSource}
                    onChange={(e) => setAdminUtmSource(e.target.value)}
                    className="border-hairline"
                    disabled={readOnly}
                  />
                </div>
                <div className="space-y-2">
                  <Label>UTM medium</Label>
                  <Input
                    value={adminUtmMedium}
                    onChange={(e) => setAdminUtmMedium(e.target.value)}
                    className="border-hairline"
                    disabled={readOnly}
                  />
                </div>
                <div className="space-y-2">
                  <Label>UTM campaign</Label>
                  <Input
                    value={adminUtmCampaign}
                    onChange={(e) => setAdminUtmCampaign(e.target.value)}
                    className="border-hairline"
                    disabled={readOnly}
                  />
                </div>
                <div className="space-y-2">
                  <Label>UTM content</Label>
                  <Input
                    value={adminUtmContent}
                    onChange={(e) => setAdminUtmContent(e.target.value)}
                    className="border-hairline"
                    disabled={readOnly}
                  />
                </div>
                <div className="space-y-2">
                  <Label>UTM term</Label>
                  <Input
                    value={adminUtmTerm}
                    onChange={(e) => setAdminUtmTerm(e.target.value)}
                    className="border-hairline"
                    disabled={readOnly}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Сегмент</Label>
                  <Input
                    value={adminSegment}
                    onChange={(e) => setAdminSegment(e.target.value)}
                    className="border-hairline"
                    disabled={readOnly}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Температура лида</Label>
                  <Select
                    value={adminLeadTemperature}
                    onValueChange={(v) => setAdminLeadTemperature(v as LeadTemperature)}
                    disabled={readOnly}
                  >
                    <SelectTrigger className="border-hairline">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cold">Холодный</SelectItem>
                      <SelectItem value="warm">Тёплый</SelectItem>
                      <SelectItem value="hot">Горячий</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Telegram ID (число)</Label>
                  <Input
                    value={adminTelegramId}
                    onChange={(e) => setAdminTelegramId(e.target.value)}
                    className="border-hairline"
                    disabled={readOnly}
                    inputMode="numeric"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    checked={adminIsDuplicate}
                    onCheckedChange={(c) => setAdminIsDuplicate(c === true)}
                    disabled={readOnly}
                  />
                  Дубликат
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    checked={adminConsent}
                    onCheckedChange={(c) => setAdminConsent(c === true)}
                    disabled={readOnly}
                  />
                  Согласие на обработку ПДн
                </label>
              </div>
            </div>
            {readOnly ? null : (
              <Button type="button" onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
                {saving ? "Сохранение…" : "Сохранить изменения"}
              </Button>
            )}
          </TabsContent>
        ) : null}

        <TabsContent value="pipeline" className="mt-6 space-y-3 outline-none">
          <h2 className="font-display text-xl text-foreground">История этапов</h2>
          <p className="text-xs text-muted-foreground">
            Полная хронология смен этапов (до {CRM_HISTORY_FETCH_LIMIT} записей). Сверху вниз: от более ранних к более
            поздним.
          </p>
          {stageHistoryChronological.length === 0 ? (
            <p className="text-sm text-muted-foreground">Пока нет переходов между этапами.</p>
          ) : (
            <div className="space-y-2">
              {stageHistoryChronological.map((item) => {
                const fromName = item.from_stage_id ? (stageNameById.get(item.from_stage_id) ?? "—") : "—";
                const toName = stageNameById.get(item.to_stage_id) ?? "Неизвестный этап";
                return (
                  <div key={item.id} className="rounded-sm border border-hairline bg-surface/20 px-3 py-2">
                    <p className="text-sm text-foreground">
                      <span className="font-medium">{fromName}</span>
                      <span className="text-muted-foreground"> → </span>
                      <span className="font-medium">{toName}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {item.changed_by} · причина: {item.reason}
                      {item.note ? ` · ${item.note}` : ""}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {format(parseISO(item.created_at), "d MMM yyyy, HH:mm", { locale: ru })}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="tasks" className="mt-6 space-y-6 outline-none">
          {readOnly ? null : (
            <div className="space-y-4 rounded-sm border border-hairline bg-surface/10 p-4">
              <h2 className="font-display text-xl text-foreground">Новая задача</h2>
              <div className="space-y-2">
                <Label>Заголовок</Label>
                <Input
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  className="border-hairline"
                  placeholder="Например: перезвонить, отправить счёт"
                />
              </div>
              <div className="space-y-2">
                <Label>Описание</Label>
                <Textarea
                  value={taskDescription}
                  onChange={(e) => setTaskDescription(e.target.value)}
                  className="min-h-[72px] border-hairline"
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Срок</Label>
                  <Input
                    type="datetime-local"
                    value={taskDue}
                    onChange={(e) => setTaskDue(e.target.value)}
                    className="border-hairline"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Приоритет</Label>
                  <Select value={taskPriority} onValueChange={(v) => setTaskPriority(v as CrmTaskPriority)}>
                    <SelectTrigger className="border-hairline">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Низкий</SelectItem>
                      <SelectItem value="medium">Средний</SelectItem>
                      <SelectItem value="high">Высокий</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Исполнитель</Label>
                <Select
                  value={taskAssigneeId ?? "__none__"}
                  onValueChange={(v) => setTaskAssigneeId(v === "__none__" ? null : v)}
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
              <Button type="button" onClick={handleAddTask} disabled={addingTask} variant="secondary">
                {addingTask ? "Добавление…" : "Добавить задачу"}
              </Button>
            </div>
          )}

          <div className="space-y-3">
            <h2 className="font-display text-xl text-foreground">Список задач</h2>
            {contactTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground">Задач пока нет.</p>
            ) : (
              <ul className="space-y-2">
                {contactTasks.map((t) => (
                  <li key={t.id} className="rounded-sm border border-hairline bg-surface/20 px-3 py-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-foreground">{t.title}</p>
                        {t.description ? (
                          <p className="mt-1 text-xs text-muted-foreground">{t.description}</p>
                        ) : null}
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t.status === "open"
                            ? "Открыта"
                            : t.status === "in_progress"
                              ? "В работе"
                              : t.status === "done"
                                ? "Выполнена"
                                : "Отменена"}
                          {" · "}
                          {t.due_at
                            ? format(parseISO(t.due_at), "d MMM yyyy HH:mm", { locale: ru })
                            : "без срока"}
                        </p>
                      </div>
                      {readOnly ? null : (
                        <div className="flex flex-wrap gap-1">
                          {t.status === "open" ? (
                            <>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-8 border-hairline text-xs"
                                onClick={() => patchTaskStatus(t.id, "in_progress")}
                              >
                                В работу
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-8 border-hairline text-xs"
                                onClick={() => patchTaskStatus(t.id, "done")}
                              >
                                Готово
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-8 text-xs text-muted-foreground"
                                onClick={() => patchTaskStatus(t.id, "cancelled")}
                              >
                                Отменить
                              </Button>
                            </>
                          ) : null}
                          {t.status === "in_progress" ? (
                            <>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-8 border-hairline text-xs"
                                onClick={() => patchTaskStatus(t.id, "done")}
                              >
                                Готово
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-8 text-xs text-muted-foreground"
                                onClick={() => patchTaskStatus(t.id, "cancelled")}
                              >
                                Отменить
                              </Button>
                            </>
                          ) : null}
                          {t.status === "done" || t.status === "cancelled" ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-8 border-hairline text-xs"
                              onClick={() => patchTaskStatus(t.id, "open")}
                            >
                              Снова открыть
                            </Button>
                          ) : null}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </TabsContent>

        <TabsContent value="activity" className="mt-6 space-y-6 outline-none">
          {readOnly ? null : (
            <div className="space-y-3 rounded-sm border border-hairline bg-surface/10 p-4">
              <div>
                <h2 className="font-display text-xl text-foreground">Новая заметка в ленту</h2>
                <p className="text-xs text-muted-foreground">
                  Попадает в события (не в поле «Комментарий» на вкладке «Основное»).
                </p>
              </div>
              <Textarea
                value={timelineNote}
                onChange={(e) => setTimelineNote(e.target.value)}
                className="min-h-[88px] border-hairline"
                placeholder="Например: отправили оффер в Telegram…"
              />
              <Button type="button" onClick={handleAddTimelineNote} disabled={addingNote} variant="secondary">
                {addingNote ? "Отправка…" : "Добавить в ленту"}
              </Button>
            </div>
          )}

          <div className="space-y-3">
            <h2 className="font-display text-xl text-foreground">События и заметки</h2>
            <p className="text-xs text-muted-foreground">
              Бот, CRM, сайт и ручные заметки (до {CRM_HISTORY_FETCH_LIMIT} записей). Новее — выше.
            </p>
            {interactions.length === 0 ? (
              <p className="text-sm text-muted-foreground">Пока нет событий.</p>
            ) : (
              <div className="space-y-2">
                {interactions.map((item) => {
                  const noteBody = interactionBodyFromPayload(item.payload);
                  const extra =
                    noteBody ??
                    (Object.keys(item.payload).length === 0
                      ? null
                      : JSON.stringify(item.payload, null, 0).slice(0, 500));
                  return (
                    <div key={item.id} className="rounded-sm border border-hairline bg-surface/20 px-3 py-2">
                      <p className="text-sm text-foreground">
                        {crmInteractionTypeLabel(item.interaction_type)}
                        <span className="text-muted-foreground">
                          {" "}
                          · {item.channel} · {item.direction}
                        </span>
                      </p>
                      {extra ? (
                        <p className="mt-1 whitespace-pre-wrap break-words text-xs text-muted-foreground">{extra}</p>
                      ) : null}
                      <p className="mt-1 text-xs text-muted-foreground">
                        {format(parseISO(item.created_at), "d MMM yyyy, HH:mm", { locale: ru })}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
