import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { getSupabase } from "@/lib/supabaseClient";
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
import type { CrmContactRow, CrmPipelineStageRow, CrmProfileRow, LeadTemperature } from "@/types/crm";
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
  const raw =
    (typeof payload.body === "string" && payload.body) ||
    (typeof payload.note === "string" && payload.note) ||
    (typeof payload.text === "string" && payload.text) ||
    (typeof payload.message === "string" && payload.message) ||
    "";
  const t = raw.trim();
  return t ? t : null;
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
  const { canWriteCrm, isCrmAdmin } = useAuth();
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

  /** Radix Select не допускает value="" и требует совпадения с SelectItem. */
  const stageCodes = useMemo(() => new Set((stages ?? []).map((s) => s.code)), [stages]);
  const funnelSelectValue = stageCode && stageCodes.has(stageCode) ? stageCode : "__crm_stage_unresolved__";

  const [stageCode, setStageCode] = useState("");
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [stageChangeNote, setStageChangeNote] = useState("");
  const [timelineNote, setTimelineNote] = useState("");
  const [addingNote, setAddingNote] = useState(false);

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

  useEffect(() => {
    if (!contact) return;
    setStageCode(currentStageCode);
    setOwnerId(contact.owner_user_id);
    setComment(contact.comment ?? "");
    setNextAction(toInputDatetimeLocal(contact.next_action_at));
    setFullName(contact.full_name ?? "");
    setPhone(contact.phone ?? "");
    setEmail(contact.email ?? "");
    setAdminSourceDetail(contact.source_detail ?? "");
    setAdminUtmSource(contact.utm_source ?? "");
    setAdminUtmMedium(contact.utm_medium ?? "");
    setAdminUtmCampaign(contact.utm_campaign ?? "");
    setAdminUtmContent(contact.utm_content ?? "");
    setAdminUtmTerm(contact.utm_term ?? "");
    setAdminSegment(contact.segment ?? "");
    setAdminSourceChannel(contact.source_channel ?? "");
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
      };

      const adminPayload = isCrmAdmin
        ? {
            source_channel: adminSourceChannel.trim() || contact.source_channel,
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
      await queryClient.invalidateQueries({ queryKey: ["crm", "contacts-list"] });
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
      await queryClient.invalidateQueries({ queryKey: ["crm", "contacts-list"] });
      await refetch();
    } finally {
      setAddingNote(false);
    }
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
    <div className="mx-auto max-w-2xl space-y-8">
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
          <Select
            value={funnelSelectValue}
            onValueChange={(v) => {
              if (v === "__crm_stage_unresolved__") return;
              setStageCode(v);
            }}
            disabled={readOnly}
          >
            <SelectTrigger className="border-hairline">
              <SelectValue placeholder="Этап" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__crm_stage_unresolved__" disabled className="text-muted-foreground">
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

        {isCrmAdmin ? (
          <div className="space-y-4 rounded-sm border border-hairline bg-surface/15 p-4">
            <h3 className="font-display text-lg text-foreground">Администратор: источник и поля карточки</h3>
            <p className="text-xs text-muted-foreground">
              Доступно только роли admin. Менеджеры видят и правят основные поля выше; здесь — UTM, сегмент, Telegram ID и
              прочее.
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label>Канал источника (source_channel)</Label>
                <Input
                  value={adminSourceChannel}
                  onChange={(e) => setAdminSourceChannel(e.target.value)}
                  className="border-hairline"
                  disabled={readOnly}
                />
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
        ) : null}

        {readOnly ? null : (
          <Button type="button" onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
            {saving ? "Сохранение…" : "Сохранить"}
          </Button>
        )}
      </div>

      {readOnly ? null : (
        <div className="space-y-3 rounded-sm border border-hairline bg-surface/10 p-4">
          <h2 className="font-display text-xl text-foreground">Добавить заметку в ленту</h2>
          <p className="text-xs text-muted-foreground">
            Текст сохранится в событиях (не заменяет поле «Комментарий» в карточке). Удобно для хроники переговоров.
          </p>
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
      </div>

      <div className="space-y-3">
        <h2 className="font-display text-xl text-foreground">События и заметки</h2>
        <p className="text-xs text-muted-foreground">
          Сообщения бота, ручные заметки и прочая активность (до {CRM_HISTORY_FETCH_LIMIT} записей). Новее — выше.
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
                    {item.interaction_type}
                    <span className="text-muted-foreground">
                      {" "}
                      · {item.channel} · {item.direction}
                    </span>
                  </p>
                  {extra ? <p className="mt-1 whitespace-pre-wrap break-words text-xs text-muted-foreground">{extra}</p> : null}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {format(parseISO(item.created_at), "d MMM yyyy, HH:mm", { locale: ru })}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
