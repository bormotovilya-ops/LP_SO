import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { getSupabase } from "@/lib/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

function toRpcString(raw: string): string | null {
  const t = raw.trim();
  return t ? t : null;
}

function parseTelegramId(raw: string): { ok: true; value: number | null } | { ok: false; message: string } {
  const t = raw.trim();
  if (!t) return { ok: true, value: null };
  if (!/^\d+$/.test(t)) {
    return { ok: false, message: "Telegram ID — только цифры или пусто" };
  }
  const n = Number(t);
  if (!Number.isSafeInteger(n)) {
    return { ok: false, message: "Слишком большой Telegram ID" };
  }
  return { ok: true, value: n };
}

export default function CrmContactNew() {
  const supabase = getSupabase();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { canWriteCrm, user } = useAuth();

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [telegramId, setTelegramId] = useState("");
  const [comment, setComment] = useState("");
  const [sourceDetail, setSourceDetail] = useState("");
  const [assignToMe, setAssignToMe] = useState(true);
  const [consent, setConsent] = useState(false);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!fullName.trim() && !phone.trim() && !email.trim() && !telegramId.trim()) {
        throw new Error("Укажите имя, телефон, email или Telegram ID — иначе нельзя отличить контакт.");
      }

      let tgNum: number | null = null;
      if (telegramId.trim()) {
        const tg = parseTelegramId(telegramId);
        if (!tg.ok) throw new Error(tg.message);
        tgNum = tg.value;
      }

      const { data, error } = await supabase.rpc("crm_upsert_contact", {
        p_full_name: toRpcString(fullName),
        p_phone: toRpcString(phone),
        p_email: toRpcString(email),
        p_telegram_id: tgNum,
        p_source_channel: "crm_manual",
        p_source_detail: toRpcString(sourceDetail),
        p_utm_source: null,
        p_utm_medium: null,
        p_utm_campaign: null,
        p_utm_content: null,
        p_utm_term: null,
        p_segment: null,
        p_owner_user_id: assignToMe && user?.id ? user.id : null,
        p_consent_personal_data: consent,
        p_comment: toRpcString(comment),
      });

      if (error) throw new Error(error.message);

      const row = data as { id?: string } | { id?: string }[] | null;
      const id =
        row && typeof row === "object" && "id" in row && typeof (row as { id: unknown }).id === "string"
          ? (row as { id: string }).id
          : Array.isArray(row) && row[0] && typeof row[0].id === "string"
            ? row[0].id
            : null;

      if (!id) throw new Error("Не удалось получить id созданного контакта");
      return id;
    },
    onSuccess: async (contactId) => {
      toast.success("Контакт создан");
      await queryClient.invalidateQueries({ queryKey: ["crm", "contacts-page"] });
      await queryClient.invalidateQueries({ queryKey: ["crm", "contacts-meta"] });
      await queryClient.invalidateQueries({ queryKey: ["crm", "dashboard-metrics"] });
      navigate(`/admin/crm/contacts/${contactId}`, { replace: true });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!canWriteCrm) {
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <p className="text-sm text-muted-foreground">Только администратор или менеджер может создавать контакты.</p>
        <Link to="/admin/crm/contacts" className="text-sm text-accent hover:underline">
          ← К списку
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-8">
      <div>
        <Link
          to="/admin/crm/contacts"
          className="text-xs uppercase tracking-wider text-muted-foreground transition-colors hover:text-accent"
        >
          ← К контактам
        </Link>
        <h1 className="mt-2 font-display text-3xl text-foreground">Новый контакт</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ручной лид из CRM (`crm_manual`): этап по умолчанию — новый лид. Дубликаты схлопываются по телефону, email или
          Telegram.
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Имя</Label>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} className="border-hairline" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Телефон</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="border-hairline" />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="border-hairline"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Telegram ID</Label>
          <Input value={telegramId} onChange={(e) => setTelegramId(e.target.value)} className="border-hairline" />
        </div>
        <div className="space-y-2">
          <Label>Деталь источника (необязательно)</Label>
          <Input
            value={sourceDetail}
            onChange={(e) => setSourceDetail(e.target.value)}
            placeholder="например: звонок, рекомендация"
            className="border-hairline"
          />
        </div>
        <div className="space-y-2">
          <Label>Комментарий</Label>
          <Textarea value={comment} onChange={(e) => setComment(e.target.value)} className="border-hairline min-h-[88px]" />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <Checkbox checked={assignToMe} onCheckedChange={(c) => setAssignToMe(c === true)} disabled={!user?.id} />
          Назначить на меня
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <Checkbox checked={consent} onCheckedChange={(c) => setConsent(c === true)} />
          Согласие на обработку ПДн
        </label>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          {mutation.isPending ? "Создание…" : "Создать контакт"}
        </Button>
        <Button type="button" variant="outline" className="border-hairline" asChild>
          <Link to="/admin/crm/contacts">Отмена</Link>
        </Button>
      </div>
    </div>
  );
}
