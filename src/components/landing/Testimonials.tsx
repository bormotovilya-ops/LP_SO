const REVIEWS = [
  {
    name: "Елена, 45 лет",
    meta: "Кондитер",
    text: "Добрый вечер! Светлана, хотела выразить благодарность, я сейчас так спокойно отношусь к деньгам, чувствую эти изменения. Я наконец перестала выискивать ценники и сверять чеки, мой скряга сбежал.",
  },
  {
    name: "Клиентка",
    meta: "После сессий",
    text: "Света, за всё это я очень благодарна вам. Ушли страхи общения с клиентами, я чётко знаю, что предложить и как продать. Деньги идут сами ко мне, и уже в начале мая люди хотят записаться на июль и даже на ноябрь.",
  },
  {
    name: "Лариса, 45 лет",
    meta: "Тренер по ораторскому искусству",
    text: "Пришла в наставничество в жутком состоянии: самобичевание, ссоры с мужем, отсутствие интереса к жизни. Половина курса пройдена, и я точно могу сказать, что хочу жить. Появился интерес к жизни, новые проекты и чувство благодарности в отношениях.",
  },
  {
    name: "Клиентка",
    meta: "Денежный практикум",
    text: "Вместе с моим состоянием выросли и заказы. Было 2-4 заказа в неделю, после проработки стало 5-9. Доход вырос с 300 000 до 800 000 рублей за месяц. Благодарю за знания, проработки и поддержку.",
  },
  {
    name: "Клиентка",
    meta: "После консультации",
    text: "Света, я внесла последний платёж по кредиту. Задолженности больше нет. Появилось больше сил и энергии, клиенты идут и записываются. Очень благодарна.",
  },
  {
    name: "Анастасия, 34 года",
    meta: "Маркетолог",
    text: "Для меня очень ценно было то, что ты меня не осудила за то, в чём мне самой себе было стыдно признаться. Ценно, что ты принимаешь меня такой, какая я есть. Благодарю.",
  },
];

const SCROLLING_REVIEWS = [...REVIEWS, ...REVIEWS];

export const Testimonials = () => (
  <section id="reviews" className="relative bg-surface py-28 md:py-40">
    <div className="container-luxe">
      <div className="mb-10 flex items-center gap-4">
        <span className="hairline h-px w-10" />
        <span className="eyebrow">Отзывы</span>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        <div className="lg:col-span-12">
          <h2 className="font-display text-4xl leading-[1.1] text-foreground md:text-5xl">
            Истории клиентов и
            <br />
            <span className="italic text-accent">результаты работы</span>
          </h2>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground">
            Реальные отзывы клиентов о диагностике, консультациях и наставничестве.
            Без обещаний «волшебной таблетки» — только опыт, изменения и личные результаты.
          </p>
        </div>
      </div>

      <div className="reviews-marquee mt-12">
        <div className="reviews-track">
          {SCROLLING_REVIEWS.map((review, idx) => (
            <article key={`${review.name}-${idx}`} className="reviews-card border border-hairline bg-background p-8">
              <div className="text-[10px] uppercase tracking-[0.28em] text-accent">Отзыв</div>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{review.text}</p>
              <div className="mt-6 border-t border-hairline pt-4">
                <div className="font-display text-xl text-foreground">{review.name}</div>
                <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  {review.meta}
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
      <div className="mt-8 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
        Публикуем только с согласия клиентов
      </div>
    </div>
  </section>
);
