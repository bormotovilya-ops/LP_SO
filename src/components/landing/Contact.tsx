import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { functionsApiUrl, supabaseFunctionsInvokeHeaders } from "@/lib/functionsApi";
import { buildTelegramBotUrl, getTelegramBotUsername } from "@/lib/botLinks";
import { parseAccountLink } from "@/lib/socialProfiles";
import {
  captureQuizUtmsFromLocation,
  computeQuizAttributionBootstrap,
  hasAnyUtm,
  loadCachedBotContextToken,
  loadStoredQuizUtm,
  mergeSessionQuizUtms,
  persistBotContextToken,
  persistQuizUtm,
  utmFingerprint,
} from "@/lib/quizAttribution";

const incomeOptions = ["До 100 000 ₽", "100 000 - 300 000 ₽", "300 000 - 500 000 ₽", "От 1 000 000 ₽"];

export const Contact = () => {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [siteUtm, setSiteUtm] = useState(() => computeQuizAttributionBootstrap().merged);
  const [botCtxToken, setBotCtxToken] = useState<string | null>(() => computeQuizAttributionBootstrap().botCtxToken);
  const [botCtxResolved, setBotCtxResolved] = useState(() => computeQuizAttributionBootstrap().botCtxResolved);

  useEffect(() => {
    const merged = mergeSessionQuizUtms(loadStoredQuizUtm(), captureQuizUtmsFromLocation());
    if (hasAnyUtm(merged)) persistQuizUtm(merged);
    setSiteUtm(merged);

    if (!hasAnyUtm(merged)) {
      setBotCtxToken(null);
      setBotCtxResolved(true);
      return;
    }

    const fp = utmFingerprint(merged);
    const cached = loadCachedBotContextToken(fp);
    if (cached) {
      setBotCtxToken(cached);
      setBotCtxResolved(true);
      return;
    }

    setBotCtxResolved(false);
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(functionsApiUrl("/crm-bot-attribution-token"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            utmSource: merged.utmSource ?? null,
            utmMedium: merged.utmMedium ?? null,
            utmCampaign: merged.utmCampaign ?? null,
            utmContent: merged.utmContent ?? null,
            utmTerm: merged.utmTerm ?? null,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as { token?: string };
        if (!cancelled && res.ok && typeof data.token === "string") {
          const tok = data.token.toLowerCase();
          setBotCtxToken(tok);
          persistBotContextToken(fp, tok);
        }
      } catch {
        /* бот откроется без _ctx_, как после квиза */
      } finally {
        if (!cancelled) setBotCtxResolved(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const diagnosticLinkBlocked = useMemo(() => hasAnyUtm(siteUtm) && !botCtxResolved, [siteUtm, botCtxResolved]);
  const diagnosticBotLinkHref = useMemo(
    () => buildTelegramBotUrl("diagnostic", { contextToken: botCtxToken ?? undefined }),
    [botCtxToken],
  );

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    const form = e.currentTarget;
    const formData = new FormData(form);
    const name = String(formData.get("name") ?? "").trim();
    const contact = String(formData.get("contact") ?? "").trim();
    const communicationChannel = String(formData.get("communicationChannel") ?? "").trim();
    const accountLink = String(formData.get("accountLink") ?? "").trim();
    const income = String(formData.get("income") ?? "").trim();
    const financialGoal = String(formData.get("financialGoal") ?? "").trim();
    const investReady = String(formData.get("investReady") ?? "").trim();
    const yearConsequence = String(formData.get("yearConsequence") ?? "").trim();
    const parsedAccount = parseAccountLink(accountLink);

    try {
      const crmRes = await fetch(functionsApiUrl("/crm-lead-upsert"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: name,
          phone: contact,
          telegramUsername: parsedAccount.telegramUsername ?? undefined,
          sourceChannel: "site_form",
          sourceDetail: "diagnostic_request",
          segment: "diagnostic",
          consentPersonalData: true,
          utmSource: siteUtm.utmSource ?? undefined,
          utmMedium: siteUtm.utmMedium ?? undefined,
          utmCampaign: siteUtm.utmCampaign ?? undefined,
          utmContent: siteUtm.utmContent ?? undefined,
          utmTerm: siteUtm.utmTerm ?? undefined,
          /** Токен и contact_id на сервере в одном шаге — без гонки attach_* из браузера. */
          mintBotLinkContext: true,
          interaction: {
            channel: "site_form",
            direction: "inbound",
            type: "diagnostic_request_submitted",
            payload: {
              communication_channel: communicationChannel || null,
              account_link: accountLink || null,
              account_platform: parsedAccount.platform,
              account_handle: parsedAccount.handle,
              income: income || null,
              financial_goal: financialGoal || null,
              invest_ready: investReady || null,
              year_consequence: yearConsequence || null,
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

      const message = [
        "Анкета на диагностику/разбор",
        `Удобный канал связи: ${communicationChannel || "—"}`,
        `Ссылка на аккаунт: ${accountLink || "—"}`,
        `Доход: ${income || "—"}`,
        `Финансовая цель: ${financialGoal || "—"}`,
        `Готовность инвестировать: ${investReady || "—"}`,
        `Если оставить все как есть: ${yearConsequence || "—"}`,
      ].join("\n");

      const res = await fetch(functionsApiUrl("/contact"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(supabaseFunctionsInvokeHeaders() as Record<string, string>),
        },
        body: JSON.stringify({
          name,
          contact,
          messenger: communicationChannel,
          accountLink,
          socialPlatform: parsedAccount.platform,
          socialHandle: parsedAccount.handle,
          telegramUsername: parsedAccount.telegramUsername,
          goal: "Запись на диагностику/разбор",
          message,
          crmEventType: "diagnostic_request_submitted",
          utmSource: siteUtm.utmSource ?? undefined,
          utmMedium: siteUtm.utmMedium ?? undefined,
          utmCampaign: siteUtm.utmCampaign ?? undefined,
          utmContent: siteUtm.utmContent ?? undefined,
          utmTerm: siteUtm.utmTerm ?? undefined,
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
            <Field name="contact" label="Твой номер телефона" required />
            <Field name="communicationChannel" label="Удобный канал связи" required placeholder="Telegram, WhatsApp..." />
            <Field name="accountLink" label="Ссылка на ваш аккаунт" required placeholder="@username или https://..." />
            <FieldSelect name="income" label="Твой доход в месяц?" required options={incomeOptions} />
            <Field name="financialGoal" label="Какую финансовую цель хочешь достичь?" required />
            <Field name="investReady" label="Готова ли инвестировать от 100 тысяч в развитие прямо сейчас?" required />
            <Field name="yearConsequence" label="Что будет, если оставить все как есть еще на год?" required />
          </div>

          <button type="submit" disabled={submitting} className="btn-brass mt-10 w-full md:w-auto">
            {submitting ? "Отправляем..." : "Отправить заявку"}
          </button>

          <div className="mt-4 space-y-2 text-[11px] leading-relaxed text-muted-foreground md:max-w-lg">
            {diagnosticLinkBlocked ? (
              <p>Готовим ссылку в бота с меткой перехода…</p>
            ) : (
              <>
                <p>
                  Ваша заявка фиксируется в боте{" "}
                  <a
                    href={diagnosticBotLinkHref}
                    target="_blank"
                    rel="noreferrer"
                    className="text-accent underline-offset-2 hover:underline"
                  >
                    @{getTelegramBotUsername()}
                  </a>
                  .
                </p>
                <p>
                  После перехода по ссылке в боте команда{" "}
                  <span className="whitespace-nowrap text-foreground/80">/start</span> выполнится автоматически.
                </p>
              </>
            )}
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

const FieldSelect = ({
  name,
  label,
  options,
  required,
}: {
  name: string;
  label: string;
  options: string[];
  required?: boolean;
}) => (
  <div>
    <label className="block text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
      {label}
      {required && <span className="text-accent"> ·</span>}
    </label>
    <select
      name={name}
      required={required}
      defaultValue=""
      className="mt-3 w-full border-b border-hairline bg-transparent py-3 text-base text-foreground outline-none transition-colors focus:border-accent"
    >
      <option value="" disabled>
        Выбери вариант
      </option>
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  </div>
);
