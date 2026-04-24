import { useEffect, useRef, useState } from "react";
import { motion, useInView } from "framer-motion";
import { TextGenerateEffect } from "@/components/ui/text-generate-effect";
import { cn } from "@/lib/utils";

const MESSAGES: string[] = [
  "Привет! Я - Светлана Ожгихина, психолог с опытом более 20 лет, трансформационный наставник, расстановщик и нумеролог",
  "По твоей дате рождения я многое вижу",
  "Если хочешь узнать свои слепые зоны и скрытые ресурсы по дате рождения, пройди ТЕСТ",
];

/** Пауза между «сообщениями» после догенерации текста */
const PAUSE_MS = 480;

type Props = { className?: string };

export function QuizChatIntro({ className }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const revealTimer = useRef<number | null>(null);
  const inView = useInView(rootRef, { once: true, amount: 0.12, margin: "0px 0px -10% 0px" });
  /** Сколько первых «сообщений» показать: 0 — ждём вью, 1–3 — пузыри, по очереди */
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (inView) setShown((s) => (s === 0 ? 1 : s));
  }, [inView]);

  useEffect(
    () => () => {
      if (revealTimer.current) window.clearTimeout(revealTimer.current);
    },
    []
  );

  return (
    <div
      ref={rootRef}
      className={cn("flex min-h-0 w-full min-w-0 flex-col gap-2 sm:gap-2.5", className)}
      aria-live="polite"
    >
      {MESSAGES.map((text, i) => {
        const n = i + 1;
        if (n > shown) return null;
        return (
          <motion.div
            key={n}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 30, mass: 0.55 }}
            className="h-auto w-full min-w-0 self-start rounded-2xl rounded-tl-sm border border-hairline/70 bg-muted/35 px-3 py-2.5 text-sm leading-relaxed text-foreground shadow-sm backdrop-blur-sm sm:px-3.5 sm:leading-relaxed"
          >
            <TextGenerateEffect
              words={text}
              filter
              duration={0.38}
              stagger={0.1}
              className="text-foreground/95"
              onAnimationComplete={() => {
                if (i >= MESSAGES.length - 1) return;
                if (revealTimer.current) window.clearTimeout(revealTimer.current);
                revealTimer.current = window.setTimeout(() => {
                  setShown((s) => Math.max(s, n + 1));
                  revealTimer.current = null;
                }, PAUSE_MS);
              }}
            />
          </motion.div>
        );
      })}
    </div>
  );
}
