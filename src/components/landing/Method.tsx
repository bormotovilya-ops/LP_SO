export const Method = () => (
  <section id="method" className="relative overflow-hidden bg-surface py-28 md:py-40">
    <div
      aria-hidden
      className="ghost-title pointer-events-none absolute -left-4 top-10 hidden text-[14vw] md:block"
    >
      method
    </div>

    <div className="container-luxe relative grid grid-cols-1 gap-16 lg:grid-cols-12">
      <div className="lg:col-span-5">
        <div className="mb-6 flex items-center gap-4">
          <span className="hairline h-px w-10" />
          <span className="eyebrow">Метод</span>
        </div>
        <h2 className="font-display text-[2.55rem] leading-[1.08] text-foreground md:text-5xl">
          Психология,
          <br />
          <span className="italic text-accent">глубокая трансформация</span>
          <br />и персональная карта человека
        </h2>
        <p className="mt-8 text-[1.05rem] leading-relaxed text-muted-foreground md:text-base">
          Мы не будем бесконечно перебирать симптомы — разберёмся, что на самом деле стоит за
          ними. Темп подстраивается под вас — без давления, чтобы изменения успевали закрепляться
          и становились частью жизни.
        </p>
      </div>

      <div className="grid gap-px bg-hairline lg:col-span-7 md:grid-cols-2">
        {[
          {
            t: "Работа со смыслами",
            d: "Безопасность, любовь, свобода, отношения с собой — фундамент устойчивых изменений.",
          },
          {
            t: "Антикризисный подход",
            d: "Быстрое погружение в корень — без долгих кружений вокруг симптомов.",
          },
          {
            t: "Персональная карта",
            d: "Нумерология как язык диагностики и самопонимания в серьёзной психологической рамке — без «предсказаний» и магического мышления.",
          },
          {
            t: "Экологичная интеграция",
            d: "Без ломки и «жёстких прорывов» — устойчивая перестройка реакций и состояния.",
          },
        ].map((b) => (
          <div key={b.t} className="bg-surface p-8 transition-colors hover:bg-background">
            <h3 className="font-display text-[1.9rem] leading-[1.2] text-foreground md:text-xl">{b.t}</h3>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground md:text-sm">{b.d}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);
