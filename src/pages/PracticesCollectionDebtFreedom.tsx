import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { Footer } from "@/components/landing/Footer";
import { ThemeSwitcher } from "@/components/landing/ThemeSwitcher";
import {
  getPracticesPaid,
  PRACTICES_PENDING_ORDER_SESSION_KEY,
  PRACTICES_STORAGE_KEY,
  setPracticesPaid,
} from "@/lib/practicesPurchase";
import { functionsApiUrl } from "@/lib/functionsApi";
import portraitImage from "../../old/фото-16.jpg";

function stripPayQueryFromUrl(): void {
  const params = new URLSearchParams(window.location.search);
  const hadPay = params.has("pay");
  const hadOid = params.has("oid");
  if (!hadPay && !hadOid) return;
  params.delete("pay");
  params.delete("oid");
  const q = params.toString();
  const path = window.location.pathname;
  const hash = window.location.hash;
  window.history.replaceState({}, "", `${path}${q ? `?${q}` : ""}${hash}`);
}

function normalizeBasePath(baseUrl: string): string {
  if (!baseUrl || baseUrl === "/") return "/";
  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}

const blocks = [
  {
    title: "БЛОК 1. Стоп-паника: Укрощение страха",
    problem:
      "Снимаем острый стресс и физический зажим, который возникает при мысли о долгах",
    result:
      "Вы возвращаете себе способность ясно мыслить. Страх перестает управлять вашим пульсом и вашими решениями",
  },
  {
    title: "БЛОК 2. Возврат ресурса: Где мои деньги?",
    problem:
      "Находим, куда вы сливаете энергию вместо того, чтобы направлять её на доход. Долг - это просто «черная дыра» вашего внимания",
    result:
      "Вы перестаете «кормить» свои кредиты всеми своими мыслями и возвращаете фокус на свою жизнь и возможности заработка",
  },
  {
    title: "БЛОК 3. Разделение: Я - это не мой долг",
    problem:
      "Убираем чувство стыда и вины. Часто мы путаем свою ценность с цифрами на банковском счету",
    result:
      "Вы восстанавливаете самооценку и начинаете действовать из позиции достойного человека, а не «провинившегося должника»",
  },
  {
    title: "БЛОК 4. Смена сценария: Выход из выживания",
    problem:
      "Работаем с привычкой мозга «всегда ожидать худшего». Мы переключаем внутренний тумблер из режима «как бы не стало хуже» в режим «что я могу создать»",
    result:
      "Появление первых реальных идей и вариантов, как увеличить доход или оптимизировать выплаты без надрыва",
  },
  {
    title: "БЛОК 5. Вектор будущего: План перехода",
    problem:
      "Создаем внутреннюю опору. Чтобы выйти из ямы, нужно смотреть не под ноги, а на горизонт",
    result:
      "Появляется четкое внутреннее ощущение пути. Вы больше не стоите на месте, вы начинаете движение к жизни, где деньги - это инструмент, а не повод для кошмаров",
  },
];

const audience = [
  "Для тех, кто застрял в «кредитной карусели»",
  "Для тех, кто много работает, но деньги «уходят сквозь пальцы»",
  "Для тех, кто чувствует долги физически",
  "Для тех, кто устал работать «на банк»",
];

const outcomes = [
  "вернете себе способность мыслить логически, а не из состояния острого стресса",
  "поймете, куда на самом деле утекает ваша энергия и почему старые методы заработка перестали работать",
  "выйдете из состояния паралича и обретете силы, чтобы начать конструктивно решать свои финансовые вопросы",
];

const PracticesCollectionDebtFreedom = () => {
  const { toast } = useToast();
  const [paying, setPaying] = useState(false);
  const [practicesPaid, setPracticesPaidState] = useState(false);
  const [receiptEmail, setReceiptEmail] = useState("");
  const paymentStartRef = useRef(false);

  const materialsHref = useMemo(() => {
    const fromEnv = import.meta.env.VITE_PRACTICES_MATERIALS_URL?.trim();
    if (fromEnv) return fromEnv;
    const base = import.meta.env.BASE_URL.endsWith("/")
      ? import.meta.env.BASE_URL
      : `${import.meta.env.BASE_URL}/`;
    return `${base}materials/sborniki-praktik.zip`;
  }, []);

  const materialsDownloadAttr = useMemo(() => {
    if (typeof window === "undefined") return true;
    try {
      const u = new URL(materialsHref, window.location.origin);
      return u.origin === window.location.origin;
    } catch {
      return false;
    }
  }, [materialsHref]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pay = params.get("pay");
    const orderIdFromUrl = params.get("oid")?.trim() ?? "";
    if (pay === "ok") {
      setPracticesPaid();
      setPracticesPaidState(true);
      const pendingOrderId =
        orderIdFromUrl || sessionStorage.getItem(PRACTICES_PENDING_ORDER_SESSION_KEY) || "";
      sessionStorage.removeItem(PRACTICES_PENDING_ORDER_SESSION_KEY);
      if (pendingOrderId) {
        void fetch(functionsApiUrl("/practices-paid-notify"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId: pendingOrderId }),
        }).catch(() => {});
      }
      stripPayQueryFromUrl();
      toast({
        title: "Оплата прошла",
        description: "Материалы можно скачать ниже. Доступ сохранится в этом браузере.",
      });
      return;
    }
    if (pay === "fail") {
      stripPayQueryFromUrl();
      toast({
        title: "Оплата не завершена",
        description: "Если списание прошло с задержкой, обновите страницу или напишите в Telegram.",
        variant: "destructive",
      });
    }
    setPracticesPaidState(Boolean(getPracticesPaid()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== null && e.key !== PRACTICES_STORAGE_KEY) return;
      setPracticesPaidState(Boolean(getPracticesPaid()));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const startPayment = async () => {
    if (paymentStartRef.current || paying) return;

    const email = receiptEmail.trim();
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!emailOk) {
      toast({
        title: "Укажите email для чека",
        description: "Перед оплатой нужно ввести корректный email, на него придет кассовый чек.",
        variant: "destructive",
      });
      return;
    }

    paymentStartRef.current = true;
    setPaying(true);
    try {
      const res = await fetch(functionsApiUrl("/payment-init"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receiptEmail: email,
          siteOrigin: window.location.origin,
          // GitHub Pages cannot open deep links directly; return to app root first.
          returnPath: normalizeBasePath(import.meta.env.BASE_URL),
        }),
      });
      const data = (await res.json()) as { paymentUrl?: string; orderId?: string; error?: string };
      if (!res.ok || !data.paymentUrl) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      if (data.orderId) {
        sessionStorage.setItem(PRACTICES_PENDING_ORDER_SESSION_KEY, data.orderId);
      }
      // Open payment in the current tab to avoid popup blockers and duplicate windows.
      window.location.assign(data.paymentUrl);
    } catch {
      toast({
        title: "Оплата недоступна",
        description: "Попробуйте позже или напишите в Telegram.",
        variant: "destructive",
      });
    } finally {
      paymentStartRef.current = false;
      setPaying(false);
    }
  };

  return (
    <main className="relative min-h-screen bg-background text-foreground">
      <ThemeSwitcher />
      <section className="relative overflow-hidden border-b border-hairline py-12 md:py-20">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,hsl(var(--accent)/0.17),transparent_40%),radial-gradient(circle_at_85%_10%,hsl(var(--primary)/0.18),transparent_38%)]" />
        <div className="container-luxe relative z-10">
          <Link
            to="/"
            className="inline-flex w-fit items-center gap-3 text-xs uppercase tracking-[0.22em] text-muted-foreground transition-colors hover:text-accent"
          >
            <span className="h-px w-10 bg-hairline" />
            <span>Назад на главную</span>
          </Link>

          <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-2 lg:items-stretch">
            <article className="relative flex h-full flex-col border border-hairline bg-background/90 p-7 shadow-[0_20px_60px_-45px_hsl(var(--accent)/0.4)] backdrop-blur md:p-10">
              <p className="eyebrow mb-4">Сборник трансформационных практик</p>
              <h1 className="font-display text-4xl leading-tight md:text-6xl">
                «Свобода от долгов и кредитов: Из выживания в жизнь»
              </h1>
              <p className="mt-6 max-w-3xl text-base leading-relaxed text-muted-foreground md:text-lg">
                Этот сборник - ваш набор скорой помощи. Здесь нет сложных теорий, только 5 шагов,
                чтобы снять «удавку» страха и увидеть выход там, где раньше была стена.
              </p>
            </article>

            <article className="group relative h-full overflow-hidden border border-hairline bg-surface/30">
              <img
                src={portraitImage}
                alt="Портрет автора практик"
                className="h-full min-h-[360px] w-full object-cover transition-transform duration-700 group-hover:scale-[1.03] lg:min-h-0"
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background/80 via-background/5 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-6">
                <div className="inline-flex items-center gap-3 border border-hairline/80 bg-background/80 px-4 py-3 backdrop-blur-sm">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                  <span className="text-[11px] uppercase tracking-[0.22em] text-foreground">
                    Сборник трансформационных практик
                  </span>
                </div>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className="py-16 md:py-20">
        <div className="container-luxe">
          <div className="mb-8 flex flex-wrap items-center gap-4 border border-accent/30 bg-[linear-gradient(115deg,hsl(var(--accent)/0.12),hsl(var(--background))_60%)] px-6 py-5 shadow-[0_16px_42px_-34px_hsl(var(--accent)/0.55)]">
            <span className="font-display text-3xl text-accent">5 ₽</span>
            <span className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
              Разовый доступ к сборнику
            </span>
            <label className="min-w-[240px] flex-1">
              <span className="mb-1 block text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                Email для чека
              </span>
              <input
                type="email"
                value={receiptEmail}
                onChange={(e) => setReceiptEmail(e.target.value)}
                placeholder="name@example.com"
                autoComplete="email"
                className="w-full border border-hairline bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-accent"
              />
              <span className="mt-1 block text-xs text-muted-foreground">
                На этот адрес придет кассовый чек и подтверждение оплаты.
              </span>
            </label>
            <button
              type="button"
              disabled={paying}
              onClick={() => void startPayment()}
              className="ml-auto inline-flex items-center justify-center border border-accent bg-background/85 px-5 py-3 text-xs uppercase tracking-[0.22em] text-accent transition-all hover:-translate-y-0.5 hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
            >
              {paying ? "Открываем оплату..." : "Оплатить 5 ₽"}
            </button>
          </div>
          {practicesPaid && (
            <div className="mb-10 flex flex-col items-start gap-4 border border-hairline bg-surface/40 p-6">
              <p className="text-sm font-medium leading-relaxed text-accent">
                Оплачено. Материалы доступны для скачивания в этом браузере.
              </p>
              <a
                href={materialsHref}
                {...(materialsDownloadAttr ? { download: true } : {})}
                className="inline-flex items-center justify-center gap-2 border border-foreground/25 bg-background px-5 py-3 text-xs uppercase tracking-[0.22em] text-foreground transition-colors hover:border-accent hover:text-accent"
              >
                Скачать материалы
              </a>
            </div>
          )}

          <div className="grid grid-cols-1 gap-px bg-hairline lg:grid-cols-2">
            {blocks.map((block, idx) => (
              <article
                key={block.title}
                className={`group bg-background p-8 transition-colors duration-300 hover:bg-surface/70 md:p-10 ${
                  idx === blocks.length - 1 ? "lg:col-span-2" : ""
                }`}
              >
                <h2 className="font-display text-2xl leading-tight text-foreground md:text-3xl">
                  {block.title}
                </h2>
                <p className="mt-5 border-l border-hairline pl-4 text-sm leading-relaxed text-muted-foreground transition-colors group-hover:border-accent/45">
                  <span className="font-medium text-foreground">Что решаем:</span> {block.problem}
                </p>
                <p className="mt-4 border-l border-hairline pl-4 text-sm leading-relaxed text-muted-foreground transition-colors group-hover:border-accent/45">
                  <span className="font-medium text-foreground">Результат:</span> {block.result}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-hairline py-16">
        <div className="container-luxe grid grid-cols-1 gap-10 lg:grid-cols-2">
          <article>
            <h2 className="font-display text-3xl md:text-4xl">Для кого этот сборник</h2>
            <ul className="mt-6 space-y-4 text-sm leading-relaxed text-muted-foreground">
              {audience.map((item) => (
                <li key={item} className="flex gap-3">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </article>
          <article>
            <h2 className="font-display text-3xl md:text-4xl">Какой результат вы получите</h2>
            <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
              Этот сборник - ваш первый шаг к пересборке реальности. Глубинная трансформация
              требует времени, но прямо сейчас вам нужно просто начать дышать.
            </p>
            <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
              После прохождения практик вы:
            </p>
            <ul className="mt-5 space-y-4 text-sm leading-relaxed text-muted-foreground">
              {outcomes.map((item) => (
                <li key={item} className="flex gap-3">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
              Это ваш фундамент спокойствия, без которого невозможно построить устойчивый капитал
              и выйти в масштаб.
            </p>
          </article>
        </div>
      </section>

      <section className="py-16 md:py-20">
        <div className="container-luxe">
          <div className="max-w-4xl border border-accent/35 bg-[linear-gradient(120deg,hsl(var(--surface)),hsl(var(--background))_65%)] p-8 shadow-[0_18px_50px_-42px_hsl(var(--accent)/0.8)] md:p-10">
            <h2 className="font-display text-3xl md:text-4xl">Почему это важно сейчас</h2>
            <p className="mt-5 text-base leading-relaxed text-muted-foreground">
              Долги закрываются не тогда, когда вы больше работаете, а когда вы перестаете их
              бояться. Этот сборник даст вам фундамент и спокойствие, чтобы вы смогли сделать свой
              первый шаг из «выживания» в нормальную, свободную жизнь ❤️
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={paying}
                onClick={() => void startPayment()}
                className="inline-flex items-center justify-center border border-accent px-5 py-3 text-xs uppercase tracking-[0.22em] text-accent transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
              >
                {paying ? "Открываем оплату..." : "Перейти к оплате 5 ₽"}
              </button>
              <Link
                to="/#products"
                className="inline-flex items-center justify-center border border-hairline px-5 py-3 text-xs uppercase tracking-[0.22em] text-muted-foreground transition-colors hover:border-accent hover:text-accent"
              >
                Смотреть другие форматы
              </Link>
            </div>
          </div>
        </div>
      </section>
      <Footer />
    </main>
  );
};

export default PracticesCollectionDebtFreedom;
