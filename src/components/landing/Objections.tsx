import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const ITEMS = [
  {
    q: "Это будет больно?",
    a: "Нет. Мой подход — экологичная интеграция, а не «жёсткий прорыв». Мы движемся в темпе, который выдерживает ваша психика. Изменения происходят постепенно, через постепенную перестройку реакций и состояния — без срывов и откатов.",
  },
  {
    q: "Это дорого",
    a: "В работе есть форматы под разный бюджет — от быстрых продуктов до индивидуального сопровождения. Финансовые изменения возможны как следствие глубокой внутренней работы, но сроки и масштаб всегда индивидуальны. Начать можно с диагностики — там же поймём, какой формат подходит именно вам.",
  },
  {
    q: "Я не готова",
    a: "Это нормальная реакция перед изменениями. Диагностика — безопасный шаг: вы ничего не подписываете, мы просто смотрим, есть ли смысл идти дальше. Если решим, что не время — расстанемся друзьями.",
  },
];

export const Objections = () => (
  <section className="relative bg-background py-28 md:py-40">
    <div className="container-luxe">
      <div className="grid grid-cols-1 gap-16 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <div className="mb-6 flex items-center gap-4">
            <span className="hairline h-px w-10" />
            <span className="eyebrow">Сомнения</span>
          </div>
          <h2 className="font-display text-4xl leading-[1.1] text-foreground md:text-5xl">
            То, что обычно <span className="italic text-accent">останавливает</span>
          </h2>
          <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
            Если хоть одна из этих мыслей знакома — это уже причина прийти на диагностику.
            Там разберёмся честно.
          </p>
        </div>

        <div className="lg:col-span-8">
          <Accordion type="single" collapsible className="w-full">
            {ITEMS.map((it, i) => (
              <AccordionItem
                key={it.q}
                value={`item-${i}`}
                className="border-b border-hairline"
              >
                <AccordionTrigger className="py-8 text-left hover:no-underline">
                  <div className="flex items-baseline gap-6">
                    <span className="font-display text-sm text-accent">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="font-display text-2xl text-foreground md:text-3xl">{it.q}</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-8 pl-12 text-base leading-relaxed text-muted-foreground">
                  {it.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </div>
  </section>
);
