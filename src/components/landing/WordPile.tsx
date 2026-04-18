import { type CSSProperties, useEffect, useMemo, useState } from "react";

const WORDS = [
  "Комплексы",
  "Страхи",
  "Депрессия",
  "Зависимость",
  "Тревога",
  "Самокритика",
  "Стыд",
  "Вина",
  "Выгорание",
  "Апатия",
  "Прокрастинация",
  "Самозванец",
  "Паника",
  "Одиночество",
  "Бессонница",
  "Контроль",
  "Обида",
  "Растерянность",
  "Усталость",
  "Раздражение",
  "Зависть",
  "Неуверенность",
  "Негатив",
  "Саботаж",
  "Сопротивление",
  "Обесценивание",
  "Навязчивость",
  "Зажатость",
  "Уныние",
  "Истощение",
  "Разочарование",
  "Тревожность",
  "Бессилие",
  "Самообман",
  "Ревность",
  "Ригидность",
] as const;

/** 1 + 2 + 3 + 4 + 5 + 6 + 7 + 8 = 36 */
const PYRAMID_ROW_COUNTS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

function toPyramidRows(list: readonly string[]): string[][] {
  const rows: string[][] = [];
  let i = 0;
  for (const n of PYRAMID_ROW_COUNTS) {
    rows.push(list.slice(i, i + n));
    i += n;
  }
  return rows;
}

function hashString(value: string): number {
  let h = 2166136261;
  for (let c = 0; c < value.length; c += 1) {
    h ^= value.charCodeAt(c);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pick(h: number, min: number, max: number): number {
  const x = Math.sin(h) * 10000;
  return min + (x - Math.floor(x)) * (max - min);
}

type ChaosPlacement = {
  left: string;
  top: string;
  z: number;
  wr: string;
  sc: number;
};

/** Хаотичная «куча»: база пирамиды + сильный джиттер и случайный порядок слоёв */
function chaosPlacement(word: string, rowIndex: number, colIndex: number, rowLen: number): ChaosPlacement {
  const h = hashString(word);
  const h2 = hashString(`${word}-pile`);

  const spread = 38 / Math.max(rowLen, 1);
  const baseLeft = 50 + (colIndex - (rowLen - 1) / 2) * spread;
  const baseTop = 12 + rowIndex * 9.5;

  const jx = pick(h, -26, 26);
  const jy = pick(h2, -24, 26);
  const jLeft = pick(h >> 3, -10, 10);
  const jTop = pick(h2 >> 5, -9, 11);

  const tilt = pick(h2 ^ rowIndex, -18, 18);
  const scale = 0.82 + pick(h >> 7, 0, 0.24);

  const z = 6 + (h % 96) + (rowIndex + colIndex) % 4;

  return {
    left: `calc(${baseLeft}% + ${jx + jLeft}px)`,
    top: `calc(${baseTop}% + ${jy + jTop}px)`,
    z,
    wr: `${tilt}deg`,
    sc: scale,
  };
}

function explodeVector(text: string): { vx: string; vy: string; vr: string } {
  const h = hashString(`${text}-boom`);
  const angle = (h % 360) * (Math.PI / 180);
  const dist = 170 + (h % 150);
  const vx = `${Math.round(Math.cos(angle) * dist)}px`;
  const vy = `${Math.round(Math.sin(angle) * dist - 55)}px`;
  const vr = `${((h >> 3) % 90) - 45}deg`;
  return { vx, vy, vr };
}

export const WordPile = () => {
  const [pulledOut, setPulledOut] = useState<Set<string>>(() => new Set());
  const [exiting, setExiting] = useState<string | null>(null);
  const [exploded, setExploded] = useState(false);
  /** Сколько раз уже сработало нажатие по блокам (1 и 2 — выдергивание, 3 — взрыв) */
  const [blockHits, setBlockHits] = useState(0);

  const rows = useMemo(() => toPyramidRows(WORDS), []);

  const placements = useMemo(() => {
    const map: Record<string, ChaosPlacement> = {};
    rows.forEach((row, ri) => {
      row.forEach((word, ci) => {
        map[word] = chaosPlacement(word, ri, ci, row.length);
      });
    });
    return map;
  }, [rows]);

  const handleWordClick = (word: string) => {
    if (exploded) return;
    if (pulledOut.has(word)) return;
    if (exiting) return;

    const nextHits = blockHits + 1;

    if (nextHits >= 3) {
      setExploded(true);
      setBlockHits(3);
      return;
    }

    setBlockHits(nextHits);
    setExiting(word);
  };

  useEffect(() => {
    if (!exiting) return;
    const word = exiting;
    const id = window.setTimeout(() => {
      setPulledOut((prev) => new Set(prev).add(word));
      setExiting(null);
    }, 640);
    return () => window.clearTimeout(id);
  }, [exiting]);

  const pileClassName = ["word-pile", exploded ? "word-pile--exploded" : ""].filter(Boolean).join(" ");

  return (
    <section aria-labelledby="word-pile-title" className="relative bg-background py-20 md:py-28">
      <div className="container-luxe">
        <div className="mb-10 max-w-3xl">
          <div className="mb-6 flex items-center gap-4">
            <span className="hairline h-px w-10" />
            <span className="eyebrow">Внутренние блоки</span>
          </div>
          <h2 id="word-pile-title" className="font-display text-3xl leading-[1.1] text-foreground md:text-4xl">
            Пирамида того, что накопилось внутри
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground md:text-base">
            Слова лежат плотной кучей, друг на друге. Первые два нажатия выдергивают слова. Третье нажатие по любому
            оставшемуся блоку — взрыв всей кучи.
          </p>
        </div>

        <div className={pileClassName}>
          <div className="word-pile__hint">
            {exploded
              ? "Куча рассыпалась"
              : blockHits === 0
                ? "Нажатие 1–2: выдернуть · 3: взрыв"
                : blockHits === 1
                  ? "Ещё одно — и на третьем взорвётся"
                  : "Следующий клик — взрыв"}
          </div>

          <div className="word-pile__heap">
            {WORDS.map((word) => {
              if (pulledOut.has(word)) return null;

              const place = placements[word];
              const boom = explodeVector(word);
              const isExiting = exiting === word;

              const style = {
                "--left": place.left,
                "--top": place.top,
                "--z": place.z,
                "--wr": place.wr,
                "--sc": place.sc,
                "--vx": boom.vx,
                "--vy": boom.vy,
                "--vr": boom.vr,
              } as CSSProperties;

              return (
                <button
                  key={word}
                  type="button"
                  className={["word-pile__word font-display", isExiting ? "word-pile__word--yank" : ""]
                    .filter(Boolean)
                    .join(" ")}
                  style={style}
                  disabled={Boolean(exiting) && !isExiting}
                  onClick={() => handleWordClick(word)}
                >
                  {word}
                </button>
              );
            })}
          </div>
        </div>

        {(exploded || pulledOut.size > 0) && (
          <div className="mt-8">
            <button
              type="button"
              className="btn-ghost-line"
              onClick={() => {
                setPulledOut(new Set());
                setExiting(null);
                setExploded(false);
                setBlockHits(0);
              }}
            >
              Собрать пирамиду снова
            </button>
          </div>
        )}
      </div>
    </section>
  );
};
