import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Eclipse, Gem, type LucideIcon, Scroll } from "lucide-react";

const ease = [0.22, 1, 0.36, 1] as const;
const view = { once: true as const, amount: 0.1 as const, margin: "0px 0px -8% 0px" as const };

/** Внутренняя рамка: inset < отступа контента, чтобы линия не совпадала с первыми/последними буквами */
const cornerInset = "inset-5 sm:inset-6";
/** Тонкая рамка с зазором от текста (текст — см. `contentGutterClass`) */
function LuxeCorners() {
  return (
    <div
      className={cn(
        "pointer-events-none absolute border border-accent/25",
        cornerInset
      )}
      aria-hidden
    />
  );
}

function LuxeWashiLine() {
  return (
    <div
      className="pointer-events-none absolute left-2 top-2 h-[min(15rem,36%)] w-px bg-gradient-to-b from-accent/30 via-accent/10 to-transparent sm:left-3 sm:top-3 sm:h-[17rem] sm:w-0.5"
      aria-hidden
    />
  );
}

/**
 * Согласовано с `cornerInset` (~1.25–1.5rem) + 1px бордер: горизонталь и вертикаль
 * с запасом, чтобы границы не сливались с линиями `QuizResultLuxeShell` и с текстом.
 */
const contentGutterClass =
  "relative z-[1] " +
  "pl-7 pr-6 sm:pl-8 sm:pr-7 md:pl-9 md:pr-8 " +
  "pt-5 pb-6 sm:pt-6 sm:pb-7";

function ResultBlockHeader({
  title,
  stepLabel,
  icon: Icon,
}: {
  title: string;
  stepLabel: string;
  icon: LucideIcon;
}) {
  return (
    <header className="mb-6 md:mb-8 lg:mb-10">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-stretch sm:gap-6 md:gap-8">
        <div className="flex shrink-0 justify-center sm:justify-start">
          <div
            className="relative flex h-16 w-16 items-center justify-center border border-accent/45 bg-gradient-to-b from-accent/[0.14] to-transparent shadow-[0_20px_50px_-28px_hsl(var(--accent)/0.35)] sm:h-[4.5rem] sm:w-[4.5rem]"
            style={{ boxShadow: "0 0 0 1px hsl(var(--foreground) / 0.05) inset" }}
          >
            <div
              className="pointer-events-none absolute inset-1.5 border border-accent/20"
              aria-hidden
            />
            <Icon className="h-7 w-7 text-accent sm:h-8 sm:w-8" strokeWidth={1.15} />
          </div>
        </div>
        <div className="min-w-0 flex-1 text-center sm:pt-1 sm:text-left">
          <p className="eyebrow mb-2 text-[9px] tracking-[0.28em] text-muted-foreground">{stepLabel}</p>
          <h3 className="font-display text-[1.45rem] leading-[1.15] tracking-tight text-foreground sm:text-2xl md:text-[1.75rem]">
            {title}
          </h3>
          <div className="mx-auto mt-3 h-px w-20 bg-gradient-to-r from-transparent via-accent/70 to-transparent sm:mx-0 sm:w-24" />
        </div>
      </div>
    </header>
  );
}

function parseListItem(text: string) {
  const t = text.trim();
  const colon = t.indexOf(":");
  if (colon < 1 || colon > 80) return { lead: null as string | null, body: t };
  return { lead: t.slice(0, colon + 1), body: t.slice(colon + 1).trim() };
}

function ListItemLuxe({ text, delay, reduce }: { text: string; delay: number; reduce: boolean }) {
  const { lead, body } = parseListItem(text);
  const inner = (
    <div
      className="rounded-sm border border-hairline/60 bg-surface/25 px-4 py-3.5 text-[0.9375rem] leading-[1.65] text-muted-foreground transition-colors hover:border-accent/25 sm:px-5 sm:py-4 md:text-base md:leading-[1.7]"
      style={{ boxShadow: "0 1px 0 hsl(var(--foreground) / 0.04)" }}
    >
      {lead ? (
        <>
          <span className="font-medium text-foreground/95">{lead}</span> {body}
        </>
      ) : (
        text
      )}
    </div>
  );
  if (reduce) return <li>{inner}</li>;
  return (
    <motion.li
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={view}
      transition={{ duration: 0.45, delay, ease }}
    >
      {inner}
    </motion.li>
  );
}

export type NumberOneTextShape = {
  title: string;
  intro: string;
  blindSpotsTitle: string;
  blindSpots: string[];
  strengthsTitle: string;
  strengths: string[];
  adviceLabel: string;
  adviceParagraphs: string[];
};

const block = {
  init: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0 },
  trans: (d: number) => ({ duration: 0.6, delay: d, ease }),
};

export function QuizResultNumberOneLuxe({ one }: { one: NumberOneTextShape }) {
  const reduceMotion = useReducedMotion();
  const reduce = Boolean(reduceMotion);

  const body = (
    <div className="relative">
      <LuxeWashiLine />
      <LuxeCorners />

      <div
        className={cn(
          "space-y-10 sm:space-y-14 md:space-y-16 lg:space-y-20",
          contentGutterClass
        )}
      >
        {reduce ? (
          <div className="max-w-3xl">
            <p className="eyebrow text-[10px] tracking-[0.25em] text-muted-foreground">Персональный разбор</p>
            <h2 className="mt-3 font-display text-2xl leading-[1.1] tracking-tight text-foreground sm:text-3xl md:text-[2.1rem]">
              {one.title}
            </h2>
            <p className="mt-5 max-w-prose text-base leading-[1.75] text-muted-foreground sm:mt-6 sm:text-lg">
              {one.intro}
            </p>
          </div>
        ) : (
          <motion.div
            initial={block.init}
            whileInView={block.show}
            viewport={view}
            transition={block.trans(0)}
            className="max-w-3xl"
          >
            <p className="eyebrow text-[10px] tracking-[0.25em] text-muted-foreground">Персональный разбор</p>
            <h2 className="mt-3 font-display text-2xl leading-[1.1] tracking-tight text-foreground sm:text-3xl md:text-[2.1rem]">
              {one.title}
            </h2>
            <p className="mt-5 max-w-prose text-base leading-[1.75] text-muted-foreground sm:mt-6 sm:text-lg">
              {one.intro}
            </p>
          </motion.div>
        )}

        {reduce ? (
          <section>
            <ResultBlockHeader title={one.blindSpotsTitle} stepLabel="I — картина" icon={Eclipse} />
            <ul className="space-y-3 sm:space-y-4">
              {one.blindSpots.map((t) => (
                <ListItemLuxe key={t} text={t} delay={0} reduce={reduce} />
              ))}
            </ul>
          </section>
        ) : (
          <motion.section
            initial={block.init}
            whileInView={block.show}
            viewport={view}
            transition={block.trans(0.08)}
          >
            <ResultBlockHeader title={one.blindSpotsTitle} stepLabel="I — картина" icon={Eclipse} />
            <ul className="space-y-3 sm:space-y-4">
              {one.blindSpots.map((t, i) => (
                <ListItemLuxe key={t} text={t} delay={0.06 * i} reduce={reduce} />
              ))}
            </ul>
          </motion.section>
        )}

        {one.strengths.length > 0 &&
          (reduce ? (
            <section>
              <ResultBlockHeader title={one.strengthsTitle} stepLabel="II — опора" icon={Gem} />
              <ul className="space-y-3 sm:space-y-4">
                {one.strengths.map((t) => (
                  <ListItemLuxe key={t} text={t} delay={0} reduce={reduce} />
                ))}
              </ul>
            </section>
          ) : (
            <motion.section
              initial={block.init}
              whileInView={block.show}
              viewport={view}
              transition={block.trans(0.1)}
            >
              <ResultBlockHeader title={one.strengthsTitle} stepLabel="II — опора" icon={Gem} />
              <ul className="space-y-3 sm:space-y-4">
                {one.strengths.map((t, i) => (
                  <ListItemLuxe key={t} text={t} delay={0.05 * i} reduce={reduce} />
                ))}
              </ul>
            </motion.section>
          ))}

        {one.adviceParagraphs.length > 0 &&
          (reduce ? (
            <section>
              <ResultBlockHeader title={one.adviceLabel} stepLabel="III — вектор" icon={Scroll} />
              <div className="w-full min-w-0 max-w-none space-y-4 sm:space-y-5">
                {one.adviceParagraphs.map((p, i) => (
                  <p
                    key={i}
                    className="text-base leading-[1.8] text-muted-foreground [overflow-wrap:normal] [word-break:normal] [hyphens:manual] sm:text-[1.075rem] sm:leading-[1.85]"
                  >
                    {p}
                  </p>
                ))}
              </div>
            </section>
          ) : (
            <motion.section
              initial={block.init}
              whileInView={block.show}
              viewport={view}
              transition={block.trans(0.12)}
            >
              <ResultBlockHeader title={one.adviceLabel} stepLabel="III — вектор" icon={Scroll} />
              <div className="w-full min-w-0 max-w-none space-y-4 sm:space-y-5">
                {one.adviceParagraphs.map((p, i) => (
                  <motion.p
                    key={i}
                    className="text-base leading-[1.8] text-muted-foreground [overflow-wrap:normal] [word-break:normal] [hyphens:manual] sm:text-[1.075rem] sm:leading-[1.85]"
                    initial={{ opacity: 0, y: 6 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={view}
                    transition={{ duration: 0.4, delay: 0.04 * i, ease }}
                  >
                    {p}
                  </motion.p>
                ))}
              </div>
            </motion.section>
          ))}
      </div>
    </div>
  );

  return body;
}

export function QuizResultLuxeShell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "relative overflow-hidden border border-hairline/80 bg-gradient-to-b from-background via-background to-muted/[0.15]",
        "px-5 py-8 sm:px-8 sm:py-10 md:px-10 md:py-12 lg:px-12 lg:py-14",
        "shadow-[0_2px_0_hsl(var(--foreground)/0.04),0_32px_80px_-32px_hsl(0_0%_0%/0.45)]",
        className
      )}
    >
      <div
        className="pointer-events-none absolute -right-20 top-20 h-64 w-64 rounded-full bg-[radial-gradient(circle_at_center,hsl(var(--accent)/0.09),transparent_70%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -left-10 bottom-0 h-40 w-40 rounded-full bg-[radial-gradient(circle_at_center,hsl(var(--primary)/0.06),transparent_70%)]"
        aria-hidden
      />
      {children}
    </div>
  );
}
