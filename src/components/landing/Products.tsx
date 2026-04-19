import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  getPracticesPaid,
  PRACTICES_PENDING_ORDER_SESSION_KEY,
  PRACTICES_STORAGE_KEY,
  setPracticesPaid,
} from "@/lib/practicesPurchase";

type Product = {
  tag: string;
  title: string;
  desc: string;
  price: string;
  priceNote: string;
  cta: string;
  href: string;
  featured?: boolean;
  /** Кнопка оплаты через Т‑Банк (сумма задаётся на сервере) */
  tbankPay?: boolean;
};

const PRODUCTS: Product[] = [
  {
    tag: "Флагман",
    title: "Групповое наставничество",
    desc: "3 месяца глубокой работы в малой группе. Еженедельные онлайн-встречи, техники между сессиями, экологичная интеграция. Вход — через диагностику.",
    price: "от 150 000 ₽",
    priceNote: "+ индивидуальное сопровождение — 250 000 ₽",
    cta: "Через диагностику",
    href: "#contact",
    featured: true,
  },
  {
    tag: "1:1",
    title: "Индивидуальная консультация",
    desc: "Персональная работа под ваш запрос: точная диагностика, стратегия, поддержка. Глубокий формат включает разбор даты рождения.",
    price: "15 000 ₽ / 1 час",
    priceNote: "25 000 ₽ — 2 часа с разбором даты рождения",
    cta: "Записаться",
    href: "#contact",
  },
  {
    tag: "Точечно",
    title: "Мини-разбор",
    desc: "Короткая фокусная сессия по конкретному запросу. Подходит, когда нужно быстро увидеть ситуацию со стороны и принять решение.",
    price: "4 990 ₽",
    priceNote: "Разовый формат",
    cta: "Записаться",
    href: "#contact",
  },
  {
    tag: "Самостоятельно",
    title: "Сборники практик",
    desc: "Авторские техники и мини-курсы. Вход в работу без длительных обязательств — для тех, кто хочет начать сам.",
    price: "2 990 – 4 990 ₽",
    priceNote: "Цифровые продукты",
    cta: "Подробнее",
    href: "#contact",
    tbankPay: true,
  },
];

function stripPayQueryFromUrl(): void {
  const params = new URLSearchParams(window.location.search);
  if (!params.has("pay")) return;
  params.delete("pay");
  const q = params.toString();
  const path = window.location.pathname;
  const hash = window.location.hash;
  window.history.replaceState({}, "", `${path}${q ? `?${q}` : ""}${hash}`);
}

export const Products = () => {
  const { toast } = useToast();
  const [paying, setPaying] = useState(false);
  const [practicesPaid, setPracticesPaidState] = useState(false);

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
    const params = new URLSearchParams(window.location.search);
    const pay = params.get("pay");
    if (pay === "ok") {
      setPracticesPaid();
      setPracticesPaidState(true);
      const pendingOrderId = sessionStorage.getItem(PRACTICES_PENDING_ORDER_SESSION_KEY);
      sessionStorage.removeItem(PRACTICES_PENDING_ORDER_SESSION_KEY);
      if (pendingOrderId) {
        void fetch("/api/practices-paid-notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId: pendingOrderId }),
        }).catch(() => {});
      }
      stripPayQueryFromUrl();
      toast({
        title: "Оплата прошла",
        description: "Материалы «Сборников практик» можно скачать ниже — доступ сохранится в этом браузере.",
      });
      const el = document.getElementById("products");
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
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
    // Реагируем только на текущий URL при первом монтировании (в т.ч. ?pay=ok после банка).
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

  const startTbankPay = async () => {
    setPaying(true);
    try {
      const res = await fetch("/api/payment-init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteOrigin: window.location.origin }),
      });
      const data = (await res.json()) as { paymentUrl?: string; orderId?: string; error?: string };
      if (!res.ok || !data.paymentUrl) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      if (data.orderId) {
        sessionStorage.setItem(PRACTICES_PENDING_ORDER_SESSION_KEY, data.orderId);
      }
      const w = window.open(data.paymentUrl, "_blank", "noopener,noreferrer");
      if (!w) {
        window.location.assign(data.paymentUrl);
      }
    } catch {
      toast({
        title: "Оплата недоступна",
        description: "Попробуйте позже или напишите в Telegram.",
        variant: "destructive",
      });
    } finally {
      setPaying(false);
    }
  };

  return (
  <section id="products" className="relative bg-background py-28 md:py-40">
    <div className="container-luxe">
      <div className="mb-16 flex flex-col items-start justify-between gap-8 md:flex-row md:items-end">
        <div>
          <div className="mb-6 flex items-center gap-4">
            <span className="hairline h-px w-10" />
            <span className="eyebrow">Линейка работы</span>
          </div>
          <h2 className="font-display text-4xl leading-[1.1] text-foreground md:text-5xl">
            Четыре формата —<br />
            <span className="italic text-accent">под разную глубину запроса</span>
          </h2>
        </div>
        <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
          Дорогие форматы — наставничество и индивидуальная работа — открываются только
          через диагностику. Это про взаимную готовность, а не про продажу.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-px bg-hairline md:grid-cols-2">
        {PRODUCTS.map((p) => (
          <article
            key={p.title}
            className={`group relative flex flex-col bg-background p-10 transition-all duration-500 hover:bg-surface ${
              p.featured ? "lg:p-12" : ""
            }`}
          >
            <div className="mb-8 flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-[0.28em] text-accent">{p.tag}</span>
              {p.featured && (
                <span className="border border-accent px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-accent">
                  ★ Флагман
                </span>
              )}
            </div>
            <h3 className="font-display text-3xl leading-tight text-foreground md:text-4xl">{p.title}</h3>
            <p className="mt-5 text-sm leading-relaxed text-muted-foreground">{p.desc}</p>

            <div className="mt-8 border-t border-hairline pt-6">
              <div className="font-display text-2xl text-accent md:text-3xl">{p.price}</div>
              <div className="mt-1 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                {p.priceNote}
              </div>
              {p.tbankPay && practicesPaid && (
                <p className="mt-4 text-xs font-medium leading-relaxed text-accent">
                  Оплачено — материалы можно скачать ниже.
                </p>
              )}
            </div>

            <div className="mt-8 flex flex-col items-start gap-4">
              <a
                href={p.href}
                className="inline-flex items-center gap-3 text-xs uppercase tracking-[0.22em] text-foreground transition-colors hover:text-accent"
              >
                <span>{p.cta}</span>
                <span className="h-px w-10 bg-accent transition-all duration-500 group-hover:w-20" />
              </a>
              {p.tbankPay && (
                <div className="flex w-full max-w-md flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-stretch">
                  <button
                    type="button"
                    disabled={paying}
                    onClick={() => void startTbankPay()}
                    className="inline-flex items-center justify-center gap-3 border border-accent px-5 py-3 text-xs uppercase tracking-[0.22em] text-accent transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50 sm:min-h-[48px]"
                  >
                    {paying ? "Открываем оплату…" : "Оплатить — 10 ₽"}
                  </button>
                  {practicesPaid && (
                    <>
                      <a
                        href={materialsHref}
                        {...(materialsDownloadAttr ? { download: true } : {})}
                        className="inline-flex items-center justify-center gap-2 border border-foreground/25 bg-surface px-5 py-3 text-xs uppercase tracking-[0.22em] text-foreground transition-colors hover:border-accent hover:text-accent sm:min-h-[48px]"
                      >
                        Скачать материалы
                      </a>
                      <p className="w-full text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                        Доступ к скачиванию сохранён в этом браузере после успешной оплаты.
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  </section>
  );
};
