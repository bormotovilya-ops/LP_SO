import { useState } from "react";
import { Link } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { functionsApiUrl, supabaseFunctionsInvokeHeaders } from "@/lib/functionsApi";
import { buildTelegramBotUrl, getTelegramBotUsername } from "@/lib/botLinks";

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
        throw new Error(`CRM upsert failed: ${crmRes.status}`);
      }

      /** Как `submitApplication` в QuizNumerology: тот же порядок тостов и тот же window.open. */
      const crmPayload = (await crmRes.json()) as {
        contact?: { id?: string } | Array<{ id?: string }>;
        botContextToken?: string;
      };
      const contactRow = Array.isArray(crmPayload.contact) ? crmPayload.contact[0] : crmPayload.contact;
      const crmContactId = contactRow?.id;

      const diagnosticBotCtx =
        typeof crmPayload.botContextToken === "string" ? crmPayload.botContextToken.toLowerCase() : undefined;

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

      const data = (await res.json().catch(() => ({}))) as { ok?: boolean };

      if (!res.ok || data.ok !== true) {
        toast({
          title: "Анкета сохранена в CRM",
          description: "Заявка в Telegram временно не отправлена.",
        });
      } else {
        toast({
          title: "Анкета отправлена",
          description: "Спасибо! Светлана свяжется с вами по указанным контактам.",
        });
        toast({
          title: "Откроем Telegram-бота",
          description: "После перехода по ссылке сценарий в боте начнётся автоматически.",
        });
        window.open(
          buildTelegramBotUrl("diagnostic", { contextToken: diagnosticBotCtx }),
          "_blank",
          "noopener,noreferrer",
        );
      }

      form.reset();
    } catch {
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

          <div className="mt-4 space-y-1.5 text-[11px] leading-relaxed text-muted-foreground md:max-w-lg">
            <p>
              <a
                href={buildTelegramBotUrl("diagnostic")}
                target="_blank"
                rel="noreferrer"
                className="text-accent underline-offset-2 hover:underline"
              >
                @{getTelegramBotUsername()}
              </a>
              {" — "}открывает бота по ссылке вида{" "}
              <span className="whitespace-nowrap text-foreground/80">t.me/…?start=…</span>
              {": "}
              это стандартный deep link — Telegram сам отправляет в чат команду{" "}
              <span className="whitespace-nowrap text-foreground/80">/start</span> с параметром сценария.
            </p>
            <p>
              После перехода по ссылке <strong className="font-medium text-foreground/90">/start выполнится автоматически</strong>
              {" "}— вводить её вручную не нужно. После успешной отправки заявки откроется та же механика, но с вашей меткой заявки в
              параметре <span className="whitespace-nowrap text-foreground/80">start</span>.
            </p>
          </div>

          <p className="mt-6 text-[11px] leading-relaxed text-muted-foreground">
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
