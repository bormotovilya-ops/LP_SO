import { useState } from "react";

type Choice = { label: string; weight: number };
type Question = { q: string; choices: Choice[] };

const QUESTIONS: Question[] = [
  {
    q: "Что чаще всего останавливает вас на пути к большему?",
    choices: [
      { label: "Страх — что не получится", weight: 1 },
      { label: "Не понимаю, чего на самом деле хочу", weight: 2 },
      { label: "Вроде хочу, но нет сил даже начать", weight: 3 },
    ],
  },
  {
    q: "Как часто вы делаете выбор «как надо», а не «как хочется»?",
    choices: [
      { label: "Иногда — и это норма", weight: 1 },
      { label: "Часто — и это утомляет", weight: 2 },
      { label: "Почти всегда — уже не различаю границу", weight: 3 },
    ],
  },
  {
    q: "Финансовый рост за последние 1–2 года:",
    choices: [
      { label: "Стабильно растёт", weight: 1 },
      { label: "Стою на месте, хотя стараюсь", weight: 2 },
      { label: "Откатываюсь, что-то блокирует", weight: 3 },
    ],
  },
  {
    q: "Что вы чувствуете чаще к концу недели?",
    choices: [
      { label: "Усталость, но удовлетворение", weight: 1 },
      { label: "Опустошение и раздражение", weight: 2 },
      { label: "«Я живу не свою жизнь»", weight: 3 },
    ],
  },
  {
    q: "Опора на себя в сложных решениях — это про вас?",
    choices: [
      { label: "Да, в большинстве случаев", weight: 1 },
      { label: "Зависит от ситуации, шатает", weight: 2 },
      { label: "Чаще ищу одобрения снаружи", weight: 3 },
    ],
  },
  {
    q: "Если бы изменения были безопасными и экологичными, вы бы:",
    choices: [
      { label: "Подумала", weight: 1 },
      { label: "Попробовала бы аккуратно", weight: 2 },
      { label: "Начала прямо сейчас", weight: 3 },
    ],
  },
];

const RESULTS = [
  {
    min: 0,
    max: 9,
    title: "Зона устойчивости",
    text: "Вы в неплохом ресурсе. Вам подойдут точечные консультации или быстрые продукты для усиления конкретных зон.",
    cta: "Посмотреть консультации",
  },
  {
    min: 10,
    max: 14,
    title: "Зона перехода",
    text: "Вы чувствуете, что переросли текущий уровень, но не до конца понимаете путь. Самый эффективный формат для вас — диагностика и индивидуальное сопровождение.",
    cta: "Записаться на диагностику",
  },
  {
    min: 15,
    max: 18,
    title: "Зона глубокой трансформации",
    text: "Запрос на изменения сильный и системный. Здесь работает наставничество — глубокая структурная работа в малой группе на 3 месяца.",
    cta: "Записаться на диагностику",
  },
];

export const TestSection = () => {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);

  const isDone = step >= QUESTIONS.length;
  const score = answers.reduce((a, b) => a + b, 0);
  const result = RESULTS.find((r) => score >= r.min && score <= r.max) ?? RESULTS[1];

  const choose = (w: number) => {
    setAnswers([...answers, w]);
    setStep(step + 1);
  };

  const reset = () => {
    setAnswers([]);
    setStep(0);
  };

  return (
    <section id="test" className="relative bg-surface py-28 md:py-40">
      <div className="container-luxe">
        <div className="mx-auto max-w-3xl">
          <div className="mb-10 text-center">
            <div className="mb-6 flex items-center justify-center gap-4">
              <span className="hairline h-px w-10" />
              <span className="eyebrow">Короткий тест · 6 вопросов</span>
              <span className="hairline h-px w-10" />
            </div>
            <h2 className="font-display text-4xl leading-[1.1] text-foreground md:text-5xl">
              В какой <span className="italic text-accent">точке</span> вы сейчас?
            </h2>
          </div>

          <div className="border border-hairline bg-background p-8 md:p-14">
            {!isDone ? (
              <>
                <div className="mb-8 flex items-center justify-between text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                  <span>
                    Вопрос {step + 1} / {QUESTIONS.length}
                  </span>
                  <div className="flex gap-1.5">
                    {QUESTIONS.map((_, i) => (
                      <span
                        key={i}
                        className={`h-px w-8 transition-colors ${
                          i <= step ? "bg-accent" : "bg-hairline"
                        }`}
                      />
                    ))}
                  </div>
                </div>

                <h3 className="font-display text-2xl leading-snug text-foreground md:text-3xl">
                  {QUESTIONS[step].q}
                </h3>

                <div className="mt-10 space-y-3">
                  {QUESTIONS[step].choices.map((c) => (
                    <button
                      key={c.label}
                      onClick={() => choose(c.weight)}
                      className="group flex w-full items-center justify-between border border-hairline bg-transparent px-6 py-5 text-left transition-all hover:border-accent hover:bg-surface"
                    >
                      <span className="text-base text-foreground">{c.label}</span>
                      <span className="h-px w-8 bg-hairline transition-all group-hover:w-14 group-hover:bg-accent" />
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-center">
                <div className="mb-3 text-[11px] uppercase tracking-[0.28em] text-accent">Ваш результат</div>
                <h3 className="font-display text-4xl text-foreground md:text-5xl">{result.title}</h3>
                <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-muted-foreground">
                  {result.text}
                </p>
                <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
                  <a href="#contact" className="btn-brass">
                    {result.cta}
                  </a>
                  <button onClick={reset} className="btn-ghost-line">
                    Пройти заново
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
