import secondaryPhoto from "@/assets/svetlana-secondary.jpg";

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
      <div className="grid grid-cols-1 gap-12 lg:grid-cols-12">
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
          <div className="mb-6 flex items-center gap-4">
            <span className="hairline h-px w-10" />
            <span className="eyebrow">Запросы</span>
          </div>
          <h2 className="font-display text-3xl leading-[1.15] text-foreground md:text-4xl lg:text-5xl">
            С чем ко мне <span className="text-accent italic">приходят</span>
          </h2>
          <div className="mt-12 grid grid-cols-1 gap-x-12 gap-y-2">
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
