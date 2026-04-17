import secondaryPhoto from "@/assets/svetlana-secondary.jpg";

const SECTIONS = [
  {
    no: "01",
    title: "Эксперты с финансовым потолком",
    text: "Вы — профи в своём деле, но доход застрял. Знаете «как», но что-то изнутри не пускает дальше. Работаем со страхом масштаба, синдромом самозванки и денежными ограничениями.",
  },
  {
    no: "02",
    title: "Женщины в найме на пороге перемен",
    text: "Чувствуете застой и понимаете, что переросли текущий формат жизни. Хотите перейти в более живое и реализованное состояние — со смелостью, опорой на себя и ясным направлением.",
  },
];

const REQUESTS = [
  "Рост дохода без выгорания",
  "Работа со страхами и сомнениями",
  "Смелость в решениях и действиях",
  "Выход из внутреннего застоя",
  "Опора на себя и самоценность",
  "Отношения и коммуникация",
];

export const Audience = () => (
  <section id="about" className="relative bg-background py-28 md:py-40">
    <div className="container-luxe">
      <div className="mb-20 grid grid-cols-1 gap-8 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <div className="mb-6 flex items-center gap-4">
            <span className="hairline h-px w-10" />
            <span className="eyebrow">Кому я помогаю</span>
          </div>
          <h2 className="font-display text-4xl leading-[1.1] text-foreground md:text-5xl">
            Два сегмента, одна суть — <span className="text-accent italic">переход в новое состояние</span>
          </h2>
        </div>
        <div className="grid gap-6 lg:col-span-8 md:grid-cols-2">
          {SECTIONS.map((s) => (
            <article
              key={s.no}
              className="group border border-hairline bg-surface p-8 transition-all duration-500 hover:border-accent"
            >
              <div className="mb-6 flex items-baseline justify-between">
                <span className="font-display text-3xl text-accent">{s.no}</span>
                <span className="hairline h-px w-12 transition-all duration-500 group-hover:w-20" />
              </div>
              <h3 className="font-display text-2xl leading-tight text-foreground">{s.title}</h3>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{s.text}</p>
            </article>
          ))}
        </div>
      </div>

      {/* Requests list with secondary photo */}
      <div className="grid grid-cols-1 gap-12 border-t border-hairline pt-16 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <div className="relative">
            <div
              aria-hidden
              className="absolute -left-4 -top-4 h-20 w-20 border-l border-t"
              style={{ borderColor: "hsl(var(--accent))" }}
            />
            <img
              src={secondaryPhoto}
              alt="Светлана Ожгихина — в работе"
              loading="lazy"
              decoding="async"
              className="relative z-10 h-auto w-full object-cover"
              style={{ aspectRatio: "3 / 4", boxShadow: "var(--shadow-elegant)" }}
            />
          </div>
        </div>
        <div className="lg:col-span-7">
          <div className="mb-10 flex items-center gap-4">
            <span className="hairline h-px w-10" />
            <span className="eyebrow">Запросы клиентов</span>
          </div>
          <div className="grid grid-cols-1 gap-x-12 gap-y-2">
            {REQUESTS.map((r, i) => (
              <div
                key={r}
                className="flex items-baseline gap-6 border-b border-hairline/60 py-5 transition-colors hover:border-accent"
              >
                <span className="font-display text-sm text-accent">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="font-display text-xl text-foreground md:text-2xl">{r}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  </section>
);
