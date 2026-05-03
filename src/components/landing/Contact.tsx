import { useState } from "react";
import { Link } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { functionsApiUrl, supabaseFunctionsInvokeHeaders } from "@/lib/functionsApi";
import { buildTelegramBotUrl } from "@/lib/botLinks";

export const Contact = () => {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    const form = e.currentTarget;
    const formData = new FormData(form);
    const name = String(formData.get("name") ?? "").trim();
    const contact = String(formData.get("contact") ?? "").trim();
    const messenger = String(formData.get("messenger") ?? "").trim();
    const goal = String(formData.get("goal") ?? "").trim();
    const message = String(formData.get("message") ?? "").trim();

    /** Сразу по клику — иначе после await браузер часто режет вторую вкладку с ботом. */
    let botTab: Window | null = null;
    try {
      botTab = window.open("about:blank", "_blank", "noopener,noreferrer");
    } catch {
      botTab = null;
    }

    try {
      const crmRes = await fetch(functionsApiUrl("/crm-lead-upsert"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: name,
          phone: contact,
          sourceChannel: "site_form",
          sourceDetail: "diagnostic_request",
          segment: "diagnostic",
          consentPersonalData: true,
          /** Токен и contact_id на сервере в одном шаге — без гонки attach_* из браузера. */
          mintBotLinkContext: true,
          interaction: {
            channel: "site_form",
            direction: "inbound",
            type: "diagnostic_request_submitted",
            payload: {
              goal: goal || null,
              messenger: messenger || null,
              message: message || null,
            },
          },
        }),
      });
      if (!crmRes.ok) {
        botTab?.close();
        throw new Error(`CRM upsert failed: ${crmRes.status}`);
      }

      const crmLead = (await crmRes.json()) as {
        contact?: { id?: string } | Array<{ id?: string }>;
        botContextToken?: string;
      };

      const contactRow = Array.isArray(crmLead.contact) ? crmLead.contact[0] : crmLead.contact;
      const UUID_RE = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
      const crmContactId =
        typeof contactRow?.id === "string" && UUID_RE.test(contactRow.id)
          ? contactRow.id.toLowerCase()
          : undefined;

      const diagnosticBotCtx =
        typeof crmLead.botContextToken === "string" ? crmLead.botContextToken.toLowerCase() : undefined;

      const botUrl = buildTelegramBotUrl("diagnostic", { contextToken: diagnosticBotCtx });

      let telegramChannelDelivered = false;
      try {
        const res = await fetch(functionsApiUrl("/contact"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(supabaseFunctionsInvokeHeaders() as Record<string, string>),
          },
          body: JSON.stringify({
            name,
            contact,
            messenger,
            goal,
            message,
            crmEventType: "diagnostic_request_submitted",
            ...(crmContactId ? { crmContactId } : {}),
          }),
        });
        let body: unknown = {};
        try {
          body = await res.json();
        } catch {
          body = {};
        }
        telegramChannelDelivered =
          res.ok &&
          typeof body === "object" &&
          body !== null &&
          (body as { ok?: unknown }).ok === true;
      } catch {
        telegramChannelDelivered = false;
      }

      let botOpened = false;
      if (botTab && !botTab.closed) {
        try {
          botTab.location.replace(botUrl);
          botOpened = true;
        } catch {
          botTab.close();
        }
      }
      if (!botOpened) {
        const w = window.open(botUrl, "_blank", "noopener,noreferrer");
        botOpened = Boolean(w);
      }
      if (!botOpened) {
        toast({
          title: "Откройте бота вручную",
          description: `${botUrl} — скопируйте ссылку или найдите бота по имени в Telegram.`,
        });
      }

      if (telegramChannelDelivered) {
        toast({
          title: "Заявка отправлена",
          description: "Мы свяжемся с вами по указанным контактам.",
        });
        toast({
          title: "Откроем Telegram-бота",
          description: botOpened
            ? "Отдельная вкладка с ботом уже открыта — после перехода сценарий начнётся автоматически."
            : "Используйте ссылку из предыдущего сообщения или откройте бота вручную.",
        });
      } else {
        toast({
          title: "Заявка сохранена в CRM",
          description: botOpened
            ? "Сообщение в рабочий Telegram временно не доставлено. В другой вкладке уже открыт бот — там продолжите сценарий."
            : "Сообщение в рабочий Telegram временно не доставлено (канал или токен бота). Если вкладку с ботом не удалось открыть — см. предыдущее уведомление со ссылкой.",
        });
      }
      form.reset();
    } catch {
      botTab?.close();
      toast({
        title: "Не удалось отправить",
        description: "Попробуйте позже или напишите в Telegram.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section id="contact" className="relative overflow-hidden bg-background py-28 md:py-40">
      <div
        aria-hidden
        className="ghost-title pointer-events-none absolute -right-6 bottom-0 hidden text-[16vw] md:block"
      >
        начать
      </div>

      <div className="container-luxe relative grid grid-cols-1 gap-16 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <div className="mb-6 flex items-center gap-4">
            <span className="hairline h-px w-10" />
            <span className="eyebrow">Запись на диагностику</span>
          </div>
          <h2 className="font-display text-4xl leading-[1.05] text-foreground md:text-6xl">
            Начнём <em className="not-italic text-accent">с диагностики</em> —
            это безопасный шаг
          </h2>
          <p className="mt-8 text-base leading-relaxed text-muted-foreground">
            Я лично изучаю каждую заявку. Перед встречей мы согласуем удобное время и формат.
            По итогу диагностики вы получите ясность по запросу и поймёте, какой формат работы
            подойдет именно вам.
          </p>

          <div className="mt-12 space-y-4 border-t border-hairline pt-8 text-sm">
            <a
              href="https://t.me/svetlana_ozhgi"
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between border-b border-hairline/60 py-3 transition-colors hover:border-accent"
            >
              <span className="text-muted-foreground">Telegram</span>
              <span className="font-display text-lg text-foreground">@svetlana_ozhgi</span>
            </a>
          </div>
        </div>

        <form
          onSubmit={onSubmit}
          className="border border-hairline bg-surface p-8 md:p-12 lg:col-span-7"
        >
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <Field name="name" label="Имя" required />
            <Field name="contact" label="Телефон или мессенджер" required />
            <Field name="messenger" label="Удобный канал связи" placeholder="Telegram, WhatsApp..." />
            <Field name="goal" label="Запрос (коротко)" />
          </div>

          <div className="mt-6">
            <label className="block text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
              О ситуации (по желанию)
            </label>
            <textarea
              name="message"
              rows={4}
              className="mt-3 w-full border-b border-hairline bg-transparent py-3 text-base text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-accent"
              placeholder="Что сейчас особенно важно для вас?"
            />
          </div>

          <button type="submit" disabled={submitting} className="btn-brass mt-10 w-full md:w-auto">
            {submitting ? "Отправляем..." : "Отправить заявку"}
          </button>

          <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
            Нажимая кнопку, вы соглашаетесь с{" "}
            <Link to="/oferta" className="text-accent underline-offset-2 hover:underline">
              публичной офертой
            </Link>
            ,{" "}
            <Link to="/privacy" className="text-accent underline-offset-2 hover:underline">
              политикой конфиденциальности
            </Link>{" "}
            и обработкой персональных данных.
          </p>
        </form>
      </div>
    </section>
  );
};

const Field = ({
  name,
  label,
  required,
  placeholder,
}: {
  name: string;
  label: string;
  required?: boolean;
  placeholder?: string;
}) => (
  <div>
    <label className="block text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
      {label}
      {required && <span className="text-accent"> ·</span>}
    </label>
    <input
      name={name}
      required={required}
      placeholder={placeholder}
      className="mt-3 w-full border-b border-hairline bg-transparent py-3 text-base text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-accent"
    />
  </div>
);
