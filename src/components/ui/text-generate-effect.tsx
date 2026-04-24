import { useEffect, useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

type TextGenerateEffectProps = {
  words: string;
  className?: string;
  /** Длительность анимации появления одного слова */
  duration?: number;
  filter?: boolean;
  /** Сдвиг между словами, с — в духе Aceternity */
  stagger?: number;
  onAnimationComplete?: () => void;
};

/**
 * @see https://ui.aceternity.com/components/text-generate-effect
 */
export function TextGenerateEffect({
  words,
  className,
  duration = 0.4,
  filter = true,
  stagger = 0.2,
  onAnimationComplete,
}: TextGenerateEffectProps) {
  const reduceMotion = useReducedMotion();
  const parts = useMemo(
    () => words.split(/\s+/u).filter((w) => w.length > 0),
    [words]
  );

  useEffect(() => {
    if (!reduceMotion) return;
    const id = requestAnimationFrame(() => onAnimationComplete?.());
    return () => cancelAnimationFrame(id);
  }, [reduceMotion, onAnimationComplete]);

  if (reduceMotion) {
    return (
      <span className={cn("block w-full max-w-full whitespace-normal break-words", className)}>{words}</span>
    );
  }

  return (
    <span
      className={cn("block w-full max-w-full whitespace-normal break-words", className)}
    >
      {parts.map((word, idx) => (
        <motion.span
          key={`${word}-${idx}`}
          className="inline will-change-[transform,filter,opacity]"
          initial={{
            opacity: 0,
            filter: filter ? "blur(8px)" : "none",
          }}
          animate={{
            opacity: 1,
            filter: filter ? "blur(0px)" : "none",
          }}
          transition={{
            duration,
            delay: idx * stagger,
            ease: [0.22, 1, 0.36, 1],
          }}
          onAnimationComplete={() => {
            if (idx === parts.length - 1) onAnimationComplete?.();
          }}
        >
          {word}
          {idx < parts.length - 1 ? " " : ""}
        </motion.span>
      ))}
    </span>
  );
}
