import { useRef, useState } from "react";

const STEPS = [
  { no: "01", t: "Диагностика", d: "Глубокая встреча: я оцениваю готовность, вы — комфорт работы со мной." },
  { no: "02", t: "Запуск", d: "Формируем индивидуальную карту запроса и плана трансформации." },
  { no: "03", t: "Сессии", d: "Одна онлайн-встреча в неделю — стабильный ритм, без перегруза." },
  { no: "04", t: "Интеграция", d: "Между сессиями — техники для самостоятельной работы и закрепления." },
  { no: "05", t: "Базовый цикл", d: "3 месяца — оптимальный срок для устойчивых изменений." },
  { no: "06", t: "Завершение", d: "При необходимости — продление до 6 мес. Дальше пауза, чтобы не было зависимости." },
];

export const Process = () => {
  const [mouseClientX, setMouseClientX] = useState<number | null>(null);
  const [hovered, setHovered] = useState(false);
  const itemRefs = useRef<Array<HTMLElement | null>>([]);

  const getIntensity = (index: number) => {
    if (!hovered || mouseClientX === null) return 0;

    const item = itemRefs.current[index];
    if (!item) return 0;

    const rect = item.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const distance = Math.abs(mouseClientX - centerX);
    // Radius tuned to match floating dock falloff feel.
    const maxDistance = 220;
    return Math.max(0, 1 - distance / maxDistance);
  };

  return (
    <section id="process" className="relative bg-surface py-28 md:py-40">
      <div className="container-luxe">
        <div className="mb-20 max-w-2xl">
          <div className="mb-6 flex items-center gap-4">
            <span className="hairline h-px w-10" />
            <span className="eyebrow">Как проходит работа</span>
          </div>
          <h2 className="font-display text-4xl leading-[1.1] text-foreground md:text-5xl">
            Путь — <span className="italic text-accent">экологичный</span>,
            результат — устойчивый
          </h2>
        </div>

        <div className="relative">
          <div className="absolute left-0 right-0 top-12 hidden h-px bg-hairline lg:block" />
          <div
            className="grid grid-cols-1 gap-12 sm:grid-cols-2 lg:grid-cols-6 lg:gap-6"
            onMouseMove={(e) => setMouseClientX(e.clientX)}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => {
              setHovered(false);
              setMouseClientX(null);
            }}
          >
            {STEPS.map((s, idx) => (
              <article
                key={s.no}
                ref={(el) => {
                  itemRefs.current[idx] = el;
                }}
                className="relative rounded-sm border p-3 transition-all duration-200 ease-out"
                style={{
                  transform: `translateY(${getIntensity(idx) * -3}px) scale(${1 + getIntensity(idx) * 0.14})`,
                  transformOrigin: "center bottom",
                  borderColor: `hsl(var(--accent) / ${0.14 + getIntensity(idx) * 0.38})`,
                  backgroundColor: `hsl(var(--background) / ${getIntensity(idx) * 0.6})`,
                }}
              >
                <div className="relative z-10 mb-6 flex h-6 w-6 items-center justify-center bg-surface transition-colors duration-300">
                  <div className="h-2 w-2 rounded-full bg-accent" />
                </div>
                <div
                  className="font-display text-2xl text-accent transition-transform duration-300"
                  style={{ transform: `translateX(${getIntensity(idx) * 2}px)` }}
                >
                  {s.no}
                </div>
                <div className="mt-2 font-display text-lg text-foreground">{s.t}</div>
                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{s.d}</p>
              </article>
            ))}
          </div>
        </div>

        <div className="mt-20 border border-hairline bg-background p-8 md:p-12">
          <p className="font-display text-2xl italic leading-relaxed text-foreground md:text-3xl">
            «Эффект часто становится заметен сначала со стороны — окружение видит изменения
            раньше, чем сама женщина их замечает в себе».
          </p>
          <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
            Этот формат не подходит тем, кто ищет «волшебную таблетку» без личной включенности.
            Изменения требуют готовности к регулярной и честной работе с собой.
          </p>
        </div>
      </div>
    </section>
  );
};
