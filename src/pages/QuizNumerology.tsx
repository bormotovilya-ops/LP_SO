import { FormEvent, ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  QuizResultLuxeShell,
  QuizResultNumberOneLuxe,
  type NumberOneTextShape,
} from "@/components/quiz/QuizResultNumberOneLuxe";
import { quizLuxeTextByNumber } from "@/data/quizNumberLuxeTexts";
import { QuizChatIntro } from "@/components/QuizChatIntro";
import { Footer } from "@/components/landing/Footer";
import { ThemeSwitcher } from "@/components/landing/ThemeSwitcher";
import { useToast } from "@/hooks/use-toast";
import { functionsApiUrl } from "@/lib/functionsApi";
import { buildTelegramBotUrl } from "@/lib/botLinks";
import { cn } from "@/lib/utils";
import quizPortrait from "../../old/IMG_2474.jpeg";

type FocusKey = "fear" | "money" | "relations";
type SituationKey = "scale" | "meaning" | "start";

const focusOptions: { key: FocusKey; label: string }[] = [
  { key: "fear", label: "1️⃣ Убрать страх" },
  { key: "money", label: "2️⃣ Деньги" },
  { key: "relations", label: "3️⃣ Отношения" },
];

const situationOptions: { key: SituationKey; label: string }[] = [
  { key: "scale", label: "1️⃣ - Не понимаю, как и куда масштабироваться?" },
  { key: "meaning", label: "2️⃣ - Вроде всё есть, но нет радости и смысла" },
  { key: "start", label: "3️⃣ - Знаю что хочу сделать, но страшно начать" },
];

/** Единая ширина: баблы, «Твои ответы», вопросы, блок результата (left + max-width) */
const quizStackClass = "w-full min-w-0 max-w-[min(100%,44rem)] self-start";

/** Число дня 1–9 — планета (нумерология дня): для ответов и подписи к результату */
const PLANET_BY_NUMBER: Record<
  1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9,
  { name: string; emoji: string }
> = {
  1: { name: "Солнце", emoji: "☀️" },
  2: { name: "Луна", emoji: "🌙" },
  3: { name: "Юпитер", emoji: "♃" },
  4: { name: "Раху", emoji: "〽️" },
  5: { name: "Меркурий", emoji: "☿" },
  6: { name: "Венера", emoji: "♀" },
  7: { name: "Кету", emoji: "✦" },
  8: { name: "Сатурн", emoji: "♄" },
  9: { name: "Марс", emoji: "♂" },
};

function planetForNumber(n: number) {
  if (n >= 1 && n <= 9) return PLANET_BY_NUMBER[n as keyof typeof PLANET_BY_NUMBER];
  return null;
}

/** Заглушки подарка: по одной на выбранную тему (финальный текст после расчёта) */
const giftStubByFocus: Record<FocusKey, string> = {
  fear:
    "Заглушка: мини-гайд «Первый шаг из страха» — скоро отправим в Telegram после подтверждения email.",
  money:
    "Заглушка: чек-лист «Денежные утечки в повседневных решениях» — в разработке, текст заменим.",
  relations:
    "Заглушка: короткая практика «Один честный разговор без обвинений» — в разработке, текст заменим.",
};

function AnswerHistoryPanel({
  focusLabel,
  situationLabel,
  quizNumber,
  showSituation = true,
  showNumber = true,
}: {
  focusLabel: string | null;
  situationLabel: string | null;
  quizNumber: number | null;
  /** На шагах 2–3: запрос показываем только с шага 3 */
  showSituation?: boolean;
  showNumber?: boolean;
}) {
  const planet = showNumber && quizNumber != null ? planetForNumber(quizNumber) : null;
  return (
    <div className="w-full shrink-0 space-y-1.5 border border-accent/30 bg-gradient-to-b from-accent/5 to-transparent px-2.5 py-2 sm:px-3 sm:py-2.5">
      <p className="text-[9px] uppercase leading-none tracking-[0.2em] text-muted-foreground">Твои ответы</p>
      {focusLabel && (
        <div className="grid grid-cols-[4rem_1fr] items-baseline gap-x-2 text-sm leading-snug">
          <span className="shrink-0 text-[10px] uppercase leading-tight tracking-[0.12em] text-muted-foreground">
            Тема
          </span>
          <span className="min-w-0 font-medium text-foreground">{focusLabel}</span>
        </div>
      )}
      {showSituation && situationLabel && (
        <div className="grid grid-cols-[4rem_1fr] items-baseline gap-x-2 text-sm leading-snug">
          <span className="shrink-0 text-[10px] uppercase leading-tight tracking-[0.12em] text-muted-foreground">
            Запрос
          </span>
          <span className="min-w-0 text-foreground">{situationLabel}</span>
        </div>
      )}
      {showNumber && quizNumber != null && (
        <div className="grid grid-cols-[4rem_1fr] items-start gap-x-2 text-sm">
          <span className="shrink-0 pt-0.5 text-[10px] uppercase leading-tight tracking-[0.12em] text-muted-foreground">
            Число
          </span>
          <span className="min-w-0 font-display text-lg font-medium leading-snug text-foreground sm:text-xl">
            <span className="tabular-nums">{quizNumber}</span>
            {planet && (
              <>
                {" "}
                <span className="whitespace-nowrap" title={planet.name} aria-hidden>
                  {planet.emoji}
                </span>{" "}
                <span className="text-base font-medium text-foreground/95 sm:text-lg">{planet.name}</span>
              </>
            )}
          </span>
        </div>
      )}
    </div>
  );
}

function ScrollReveal({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const markIfVisible = () => {
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight * 0.92 && r.bottom > 0) setShow(true);
    };
    markIfVisible();
    const io = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) setShow(true);
      },
      { threshold: 0.08, rootMargin: "0px 0px -20px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className={cn(
        "will-change-transform",
        "transition-[opacity,transform]",
        show ? "translate-y-0 opacity-100" : "translate-y-7 opacity-0",
        "duration-700 ease-out motion-reduce:translate-y-0 motion-reduce:opacity-100 motion-reduce:transition-none",
        className
      )}
    >
      {children}
    </div>
  );
}

type ResultBundle = { kind: "luxe"; one: NumberOneTextShape } | { kind: "generic"; title: string };

function reduceToOneDigit(dayRaw: string): number | null {
  const day = Number(dayRaw);
  if (!Number.isInteger(day) || day < 1 || day > 31) return null;
  let n = day;
  while (n > 9) {
    n = String(n)
      .split("")
      .reduce((sum, d) => sum + Number(d), 0);
  }
  return n;
}

const QuizNumerology = () => {
  const { toast } = useToast();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  const [focus, setFocus] = useState<FocusKey | null>(null);
  const [situation, setSituation] = useState<SituationKey | null>(null);
  const [birthDay, setBirthDay] = useState("");
  const [quizNumber, setQuizNumber] = useState<number | null>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [telegram, setTelegram] = useState("");
  const [income, setIncome] = useState("");
  const [financialGoal, setFinancialGoal] = useState("");
  const [investReady, setInvestReady] = useState("");
  const [yearConsequence, setYearConsequence] = useState("");
  const [policyAccepted, setPolicyAccepted] = useState(false);
  const [sending, setSending] = useState(false);
  const [showBookingForm, setShowBookingForm] = useState(false);
  const bookingFormRef = useRef<HTMLDivElement | null>(null);

  const focusLabel = useMemo(
    () => (focus ? focusOptions.find((f) => f.key === focus)?.label : null),
    [focus]
  );
  const situationLabel = useMemo(
    () => (situation ? situationOptions.find((s) => s.key === situation)?.label : null),
    [situation]
  );
  const resultBundle = useMemo((): ResultBundle | null => {
    if (!quizNumber) return null;
    if (quizNumber >= 1 && quizNumber <= 9) {
      return { kind: "luxe", one: quizLuxeTextByNumber[quizNumber as keyof typeof quizLuxeTextByNumber] };
    }
    return { kind: "generic", title: `Твой результат: Число ${quizNumber}` };
  }, [quizNumber]);

  const submitApplication = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!policyAccepted) {
      toast({
        title: "Нужно подтверждение",
        description: "Подтвердите ознакомление с политикой и офертой.",
        variant: "destructive",
      });
      return;
    }

    setSending(true);
    try {
      const message = [
        "Анкета после квиза",
        `Тема подарка: ${focus ?? "—"}`,
        `Текст подарка: ${focus ? giftStubByFocus[focus] : "—"}`,
        `Главный запрос: ${situation ?? "—"}`,
        `Число дня: ${quizNumber ?? "—"}`,
        `Telegram: ${telegram || "—"}`,
        `Доход: ${income || "—"}`,
        `Финансовая цель: ${financialGoal || "—"}`,
        `Готовность инвестировать: ${investReady || "—"}`,
        `Если оставить все как есть: ${yearConsequence || "—"}`,
      ].join("\n");

      const res = await fetch(functionsApiUrl("/contact"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          contact: phone,
          messenger: telegram,
          goal: "Запись на консультацию после квиза",
          message,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as { ok?: boolean };
      if (!res.ok || data.ok !== true) throw new Error("send failed");

      toast({
        title: "Анкета отправлена",
        description: "Спасибо! Светлана свяжется с вами по указанным контактам.",
      });
      toast({
        title: "Откроем Telegram-бота",
        description: "После открытия бота обязательно нажмите Start, чтобы заявка закрепилась.",
      });
      window.open(buildTelegramBotUrl("razbor"), "_blank", "noopener,noreferrer");
      setName("");
      setPhone("");
      setTelegram("");
      setIncome("");
      setFinancialGoal("");
      setInvestReady("");
      setYearConsequence("");
      setPolicyAccepted(false);
    } catch {
      toast({
        title: "Не удалось отправить",
        description: "Попробуйте позже или напишите в Telegram.",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  const openBookingForm = () => {
    setShowBookingForm(true);
    requestAnimationFrame(() => {
      bookingFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  useLayoutEffect(() => {
    if (step !== 4) return;
    const id = requestAnimationFrame(() => {
      document.getElementById("quiz-result")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => cancelAnimationFrame(id);
  }, [step]);

  return (
    <main className="relative bg-background text-foreground">
      <ThemeSwitcher />
      <section
        className={cn(
          "relative flex flex-col border-b border-hairline py-3 md:py-4",
          step < 4
            ? "h-[100dvh] min-h-0 max-h-[100dvh] overflow-hidden"
            : "min-h-[100dvh] overflow-visible"
        )}
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,hsl(var(--accent)/0.17),transparent_40%),radial-gradient(circle_at_85%_10%,hsl(var(--primary)/0.18),transparent_38%)]" />
        <div className="container-luxe relative z-10 flex min-h-0 flex-1 flex-col">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
            <p className="eyebrow">Тест по дате рождения</p>
            <Link
              to="/"
              className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-accent"
            >
              ← На главную
            </Link>
          </div>

          <ScrollReveal className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="mt-1 flex min-h-0 min-w-0 flex-1 flex-col md:mt-2">
              <h1 className="shrink-0 max-w-4xl font-display text-[1.7rem] leading-[1.12] tracking-tight sm:text-3xl md:text-[2.4rem] md:leading-[1.08] lg:text-[2.35rem]">
                Твой потенциал ждет. Пройди тест
              </h1>

              <div className="mt-3 grid min-h-0 min-w-0 flex-1 grid-cols-1 items-stretch gap-3 sm:mt-4 sm:gap-4 lg:mt-3 lg:grid-cols-12 lg:gap-5 xl:gap-6">
                <figure className="group relative min-h-0 shrink-0 self-start lg:col-span-5">
                  <div className="mx-auto w-full max-w-[19rem] overflow-hidden rounded-2xl border border-hairline/80 bg-muted/20 shadow-[0_20px_60px_-24px_hsl(var(--foreground)/0.25),0_0_0_1px_hsl(var(--foreground)/0.04)] ring-1 ring-inset ring-white/5 sm:max-w-[22rem] lg:mx-0 lg:max-w-[min(26rem,100%)]">
                    <div className="relative aspect-[3/4] w-full">
                      <img
                        src={quizPortrait}
                        alt="Светлана Ожгихина — бизнес-психолог, портрет"
                        width={1200}
                        height={1600}
                        sizes="(min-width: 1024px) 26rem, 90vw"
                        loading="eager"
                        decoding="async"
                        className="h-full w-full object-cover object-[center_18%] transition-transform duration-700 ease-out will-change-transform group-hover:scale-[1.02]"
                      />
                    </div>
                  </div>
                  <figcaption className="mt-2 flex flex-wrap items-center justify-center gap-1.5 text-[9px] uppercase leading-relaxed tracking-[0.2em] text-muted-foreground sm:text-[10px] lg:justify-start lg:tracking-[0.18em]">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                    <span>Светлана Ожгихина │ Бизнес-психолог | Наставник</span>
                  </figcaption>
                </figure>

                <div className="flex min-h-0 min-w-0 flex-col overflow-hidden pt-0.5 lg:col-span-7">
                  <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain [scrollbar-gutter:stable]">
                    <div className={cn("flex flex-col gap-3 sm:gap-3.5", quizStackClass, "pb-1")}>
                      <QuizChatIntro className="w-full shrink-0" />

                      {step < 4 && (
                        <div className="w-full space-y-3">
                        {step >= 2 && (
                          <AnswerHistoryPanel
                            focusLabel={focusLabel}
                            situationLabel={situationLabel}
                            quizNumber={null}
                            showSituation={step >= 3}
                            showNumber={false}
                          />
                        )}

                        {step === 1 && (
                          <div className="w-full border border-hairline bg-surface/40 p-3 sm:p-4">
                            <h2 className="font-display text-lg leading-tight tracking-tight sm:text-xl md:text-2xl">
                              Какая сфера сейчас &quot;горит&quot; больше всего?
                            </h2>
                            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                              Выбери цифру, и я пришлю тебе небольшую практику в подарок 🎁
                            </p>
                            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-2.5">
                              {focusOptions.map((opt) => (
                                <button
                                  key={opt.key}
                                  type="button"
                                  onClick={() => {
                                    setFocus(opt.key);
                                    setStep(2);
                                  }}
                                  className="border border-hairline px-3 py-2.5 text-left text-sm transition-colors hover:border-accent/60"
                                >
                                  {opt.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {step === 2 && (
                          <div className="w-full border border-hairline bg-surface/40 p-3 sm:p-4">
                            <h2 className="font-display text-lg sm:text-xl md:text-2xl">Отлично! Идем дальше!</h2>
                            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                              Чтобы я могла расшифровать твой код, мне важно понять, где ты сейчас.
                            </p>
                            <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
                              Выбери, что беспокоит больше всего 👇
                            </p>
                            <div className="mt-3 space-y-1.5">
                              {situationOptions.map((opt) => (
                                <button
                                  key={opt.key}
                                  type="button"
                                  onClick={() => {
                                    setSituation(opt.key);
                                    setStep(3);
                                  }}
                                  className="w-full border border-hairline px-3 py-2.5 text-left text-sm transition-colors hover:border-accent/60"
                                >
                                  {opt.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {step === 3 && (
                          <div className="w-full border border-hairline bg-surface/40 p-3 sm:p-4">
                            <h2 className="font-display text-lg sm:text-xl md:text-2xl">Поняла тебя. Теперь давай к цифрам.</h2>
                            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                              Возьми свой день рождения и сложи его цифры до однозначного числа (от 1 до 9)
                            </p>
                            <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
                              Например: 07= 0+7=7 или 29=2+9=11=1+1=2
                            </p>
                            <p className="mt-1.5 text-sm text-muted-foreground">Какое число получилось?</p>
                            <p className="mt-0.5 text-sm text-muted-foreground">Нажми эту кнопку ниже 👇</p>
                            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-stretch">
                              <input
                                value={birthDay}
                                onChange={(e) => setBirthDay(e.target.value.replace(/[^\d]/g, ""))}
                                placeholder="Например: 19"
                                className="w-full min-w-0 border border-hairline bg-background px-3 py-2.5 text-base outline-none transition-colors focus:border-accent sm:max-w-[11rem]"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const reduced = reduceToOneDigit(birthDay);
                                  if (!reduced) {
                                    toast({
                                      title: "Некорректное значение",
                                      description: "Введите число от 1 до 31.",
                                      variant: "destructive",
                                    });
                                    return;
                                  }
                                  setQuizNumber(reduced);
                                  setStep(4);
                                }}
                                className="inline-flex shrink-0 items-center justify-center border border-accent px-4 py-2.5 text-[10px] uppercase tracking-[0.2em] text-accent transition-colors hover:bg-accent hover:text-accent-foreground"
                              >
                                Мой результат
                              </button>
                            </div>
                          </div>
                        )}
                        </div>
                      )}

                      {step === 4 && resultBundle && (
                        <AnswerHistoryPanel
                          focusLabel={focusLabel}
                          situationLabel={situationLabel}
                          quizNumber={quizNumber}
                        />
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {step === 4 && resultBundle && (
                <div className="mt-3 w-full min-w-0 space-y-3 border-t border-hairline/80 pt-4 sm:mt-4 sm:space-y-4 sm:pt-5">
                  <div className="mx-auto w-full max-w-5xl space-y-3 sm:space-y-4">
                  <article
                    id="quiz-result"
                    className="scroll-mt-20 w-full animate-in fade-in-0 duration-500 motion-reduce:animate-none"
                  >
                    {resultBundle.kind === "luxe" && (
                      <QuizResultLuxeShell>
                        <QuizResultNumberOneLuxe one={resultBundle.one} />
                      </QuizResultLuxeShell>
                    )}

                    {resultBundle.kind === "generic" && (
                      <QuizResultLuxeShell>
                        <h2 className="font-display text-2xl leading-tight sm:text-3xl md:text-4xl">{resultBundle.title}</h2>
                      </QuizResultLuxeShell>
                    )}

                    <div className="mt-6 rounded-lg border border-hairline/90 bg-surface/40 p-4 sm:mt-8 sm:p-5 md:p-6">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-3">
                        <div className="flex min-h-0 flex-col">
                          <button
                            type="button"
                            onClick={openBookingForm}
                            className="inline-flex min-h-11 w-full items-center justify-center border border-accent bg-accent px-3 py-2.5 text-[11px] font-medium uppercase leading-tight tracking-[0.16em] text-accent-foreground shadow-sm transition-colors hover:bg-accent/90 sm:min-h-[3rem] sm:text-xs sm:tracking-[0.18em]"
                          >
                            Записаться на разбор
                          </button>
                          {!showBookingForm && (
                            <p className="mt-1.5 text-[11px] text-muted-foreground sm:mt-2 sm:text-xs">
                              Анкета откроется после нажатия — твои ответы помогут подготовить встречу.
                            </p>
                          )}
                        </div>
                        <div className="flex min-h-0 flex-col">
                          <a
                            href={buildTelegramBotUrl("present")}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex min-h-11 w-full items-center justify-center border border-hairline bg-background/60 px-3 py-2.5 text-center text-[11px] font-medium uppercase leading-tight tracking-[0.1em] text-muted-foreground transition-colors hover:border-muted-foreground/30 hover:bg-background hover:text-foreground sm:min-h-[3rem] sm:text-xs"
                          >
                            Получить подарок
                          </a>
                          <p className="mt-1.5 text-[11px] text-muted-foreground sm:mt-2 sm:text-xs">@assistantsitebot</p>
                          <p className="mt-1 text-[11px] text-muted-foreground sm:text-xs">
                            После открытия бота обязательно нажми Start.
                          </p>
                        </div>
                      </div>
                    </div>
                  </article>

                  {showBookingForm && (
                    <article
                      ref={bookingFormRef}
                      className="w-full border border-hairline bg-surface/40 p-4 sm:p-5 md:p-6"
                    >
                      <h2 className="font-display text-xl sm:text-2xl md:text-3xl">Анкета для записи на консультацию</h2>
                      <p className="mt-2 text-sm text-muted-foreground">Прежде чем мы встретимся, ответь на вопросы ниже.</p>

                      <form onSubmit={submitApplication} className="mt-4 space-y-4 sm:mt-5 sm:space-y-5">
                        <Input label="Как тебя зовут?" required value={name} onChange={setName} />
                        <Input
                          label="Твой номер телефона"
                          required
                          value={phone}
                          onChange={setPhone}
                        />
                        <Input
                          label="Твой ник в Telegram"
                          required
                          value={telegram}
                          onChange={setTelegram}
                        />

                        <Select
                          label="Твой доход в месяц?"
                          required
                          value={income}
                          onChange={setIncome}
                          options={[
                            "До 100 000 ₽",
                            "100 000 - 300 000 ₽",
                            "300 000 - 500 000 ₽",
                            "От 1 000 000 ₽",
                          ]}
                        />

                        <Input
                          label="Какую финансовую цель хочешь достичь?"
                          required
                          value={financialGoal}
                          onChange={setFinancialGoal}
                        />
                        <Input
                          label="Готова ли инвестировать от 100 тысяч в развитие прямо сейчас?"
                          required
                          value={investReady}
                          onChange={setInvestReady}
                        />
                        <Input
                          label="Что будет, если оставить все как есть еще на год?"
                          required
                          value={yearConsequence}
                          onChange={setYearConsequence}
                        />

                        <label className="flex items-start gap-3 text-sm text-muted-foreground">
                          <input
                            type="checkbox"
                            checked={policyAccepted}
                            onChange={(e) => setPolicyAccepted(e.target.checked)}
                            className="mt-1 h-4 w-4"
                          />
                          <span>
                            Ознакомилась с{" "}
                            <Link to="/privacy" className="text-accent underline-offset-2 hover:underline">
                              политикой конфиденциальности
                            </Link>{" "}
                            и{" "}
                            <Link to="/oferta" className="text-accent underline-offset-2 hover:underline">
                              договором оферты
                            </Link>
                            .
                          </span>
                        </label>

                        <button
                          type="submit"
                          disabled={sending}
                          className="inline-flex items-center justify-center border border-accent px-5 py-2.5 text-xs uppercase tracking-[0.2em] text-accent transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50 sm:px-6 sm:py-3 sm:tracking-[0.22em]"
                        >
                          {sending ? "Отправляем..." : "Отправить анкету"}
                        </button>
                      </form>
                    </article>
                  )}
                  </div>
                </div>
              )}
            </div>
          </ScrollReveal>
        </div>
      </section>
      <Footer />
    </main>
  );
};

const Input = ({
  label,
  value,
  onChange,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) => (
  <div>
    <label className="block text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
      {label}
    </label>
    <input
      value={value}
      required={required}
      onChange={(e) => onChange(e.target.value)}
      className="mt-2 w-full border border-hairline bg-background px-4 py-3 text-base outline-none transition-colors focus:border-accent"
    />
  </div>
);

const Select = ({
  label,
  value,
  onChange,
  options,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  required?: boolean;
}) => (
  <div>
    <label className="block text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
      {label}
    </label>
    <select
      value={value}
      required={required}
      onChange={(e) => onChange(e.target.value)}
      className="mt-2 w-full border border-hairline bg-background px-4 py-3 text-base outline-none transition-colors focus:border-accent"
    >
      <option value="">Выбери вариант</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  </div>
);

export default QuizNumerology;
