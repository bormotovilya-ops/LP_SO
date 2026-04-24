import portrait from "@/assets/svetlana-portrait.jpg";

export const Hero = () => (
  <section className="relative min-h-[100svh] overflow-hidden bg-surface">
    {/* Ghost backdrop word */}
    <div
      aria-hidden
      className="ghost-title pointer-events-none absolute -right-6 top-[42%] hidden -translate-y-1/2 text-[18vw] leading-none md:block"
    >
      psychology
    </div>

    <div className="container-luxe relative grid min-h-[100svh] grid-cols-1 items-center gap-10 pb-12 pt-28 md:pb-14 md:pt-32 lg:grid-cols-12 lg:gap-8">
      {/* Left — text */}
      <div className="lg:col-span-6">
        <div className="mb-8 flex items-center gap-4">
          <span className="hairline h-px w-10" />
          <span className="eyebrow">Бизнес-психолог · Наставник</span>
        </div>

        <h1 className="font-display text-[clamp(2.2rem,5.7vw,4.8rem)] leading-[1.02] tracking-tight text-foreground">
          Изменения —<br />
          это <em className="not-italic text-accent">легче, чем кажется</em>
        </h1>

        <p className="mt-6 max-w-md text-base leading-relaxed text-muted-foreground md:text-lg">
          Помогаю женщинам-экспертам выйти из внутреннего застоя, обрести опору на себя
          и перейти в новое состояние — где доход, отношения и решения растут вместе с вами.
        </p>

        <div className="mt-8 flex flex-col gap-4 sm:flex-row">
          <a href="#contact" className="btn-brass">
            Записаться на диагностику
          </a>
          <a
            href="/quiz"
            className="inline-flex items-center justify-center border border-hairline px-6 py-3 text-xs uppercase tracking-[0.22em] text-muted-foreground transition-colors hover:border-accent hover:text-accent"
          >
            Пройти тест
          </a>
        </div>

        <div className="mt-10 grid max-w-md grid-cols-3 gap-5 border-t border-hairline pt-6">
          <div>
            <div className="font-display text-3xl text-accent">С 1998</div>
            <div className="mt-1 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">в психологии</div>
          </div>
          <div>
            <div className="font-display text-3xl text-accent">2 диплома</div>
            <div className="mt-1 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">психолог и коуч</div>
          </div>
          <div>
            <div className="font-display text-3xl text-accent">С 2019</div>
            <div className="mt-1 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">онлайн-практика</div>
          </div>
        </div>
      </div>

      {/* Right — portrait */}
      <div className="lg:col-span-6">
        <div className="relative mx-auto w-full max-w-[470px]">
          <div
            aria-hidden
            className="absolute -left-6 -top-6 h-24 w-24 border-l border-t"
            style={{ borderColor: "hsl(var(--accent))" }}
          />
          <div
            aria-hidden
            className="absolute -bottom-6 -right-6 h-24 w-24 border-b border-r"
            style={{ borderColor: "hsl(var(--accent))" }}
          />
          <img
            src={portrait}
            alt="Светлана Ожгихина — бизнес-психолог, портрет"
            width={1280}
            height={1707}
            loading="eager"
            decoding="async"
            className="relative z-10 h-auto w-full object-cover object-top"
            style={{ boxShadow: "var(--shadow-elegant)", aspectRatio: "3 / 4", imageRendering: "auto" }}
          />
          <div className="absolute bottom-6 left-6 z-20 max-w-[200px] bg-background/85 p-4 backdrop-blur-sm">
            <div className="text-[10px] uppercase tracking-[0.28em] text-accent">бизнес-психолог</div>
            <div className="mt-1 font-display text-lg leading-tight text-foreground">
              Психология глубокой трансформации
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
);
