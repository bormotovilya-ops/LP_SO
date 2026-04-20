import { Link } from "react-router-dom";

type CollectionItem = {
  title: string;
  href: string;
};

type Product = {
  tag: string;
  title: string;
  desc: string;
  price: string;
  priceNote: string;
  href: string;
  featured?: boolean;
  collections?: CollectionItem[];
};

const PRODUCTS: Product[] = [
  {
    tag: "Флагман",
    title: "Групповое наставничество",
    desc: "3 месяца глубокой работы в малой группе. Еженедельные онлайн-встречи, техники между сессиями, экологичная интеграция. Вход — через диагностику.",
    price: "от 150 000 ₽",
    priceNote: "+ индивидуальное сопровождение — 250 000 ₽",
    href: "#contact",
    featured: true,
  },
  {
    tag: "1:1",
    title: "Индивидуальная консультация",
    desc: "Персональная работа под ваш запрос: точная диагностика, стратегия, поддержка. Глубокий формат включает разбор даты рождения.",
    price: "15 000 ₽ / 1 час",
    priceNote: "25 000 ₽ — 2 часа с разбором даты рождения",
    href: "#contact",
  },
  {
    tag: "Точечно",
    title: "Мини-разбор",
    desc: "Короткая фокусная сессия по конкретному запросу. Подходит, когда нужно быстро увидеть ситуацию со стороны и принять решение.",
    price: "4 990 ₽",
    priceNote: "Разовый формат",
    href: "#contact",
  },
  {
    tag: "Самостоятельно",
    title: "Сборники практик",
    desc: "Авторские техники и мини-курсы. Вход в работу без длительных обязательств — для тех, кто хочет начать сам.",
    price: "2 990 – 4 990 ₽",
    priceNote: "Цифровые продукты",
    href: "/practices/svoboda-ot-dolgov",
    collections: [
      {
        title: "Свобода от долгов и кредитов",
        href: "/practices/svoboda-ot-dolgov",
      },
    ],
  },
];

export const Products = () => {
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
              {p.collections && p.collections.length > 0 && (
                <div className="mt-6 space-y-2">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                    Доступные сборники
                  </p>
                  {p.collections.map((collection) => (
                    <Link
                      key={collection.href}
                      to={collection.href}
                      className="group/item inline-flex w-full items-center justify-between border border-hairline bg-surface/40 px-4 py-3 text-left text-xs uppercase tracking-[0.18em] text-foreground transition-colors hover:border-accent hover:text-accent"
                    >
                      <span>{collection.title}</span>
                      <span className="text-accent transition-transform duration-300 group-hover/item:translate-x-1">
                        →
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {!p.collections?.length && (
              <div className="mt-8">
                {p.href.startsWith("/") ? (
                  <Link
                    to={p.href}
                    className="inline-flex items-center gap-3 text-xs uppercase tracking-[0.22em] text-foreground transition-colors hover:text-accent"
                  >
                    <span>Перейти</span>
                    <span className="h-px w-10 bg-accent transition-all duration-500 group-hover:w-20" />
                  </Link>
                ) : (
                  <a
                    href={p.href}
                    className="inline-flex items-center gap-3 text-xs uppercase tracking-[0.22em] text-foreground transition-colors hover:text-accent"
                  >
                    <span>Перейти</span>
                    <span className="h-px w-10 bg-accent transition-all duration-500 group-hover:w-20" />
                  </a>
                )}
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  </section>
  );
};
