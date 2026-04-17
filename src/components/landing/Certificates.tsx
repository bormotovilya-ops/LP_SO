import diplomaMSI from "@/assets/diploma-msi.jpg";
import diplomaRetraining from "@/assets/diploma-retraining.jpg";
import certificateICM from "@/assets/certificate-icm.jpg";

const items = [
  {
    src: diplomaMSI,
    title: "Психолог, преподаватель психологии",
    org: "Московский психолого-социальный институт",
    year: "2005",
    type: "Высшее образование",
  },
  {
    src: diplomaRetraining,
    title: "Психология консультирования и управления",
    org: "АНО ДПО «Институт Постдипломного Образования»",
    year: "2023",
    type: "Профессиональная переподготовка",
  },
  {
    src: certificateICM,
    title: "Professional Coaching Program «PROFICOACH»",
    org: "ICM — Institute of Consulting & Management",
    year: "288 ак. часов",
    type: "Международная сертификация",
  },
];

export const Certificates = () => (
  <section id="certificates" className="relative bg-surface py-24 md:py-32">
    <div className="container-luxe">
      <div className="mb-16 grid items-end gap-8 md:grid-cols-12">
        <div className="md:col-span-7">
          <div className="mb-6 flex items-center gap-4">
            <span className="hairline h-px w-10" />
            <span className="eyebrow">Образование · Сертификация</span>
          </div>
          <h2 className="font-display text-[clamp(2rem,4.4vw,3.6rem)] leading-[1.05] tracking-tight text-foreground">
            Дипломы и <em className="not-italic text-accent">сертификаты</em>
          </h2>
        </div>
        <p className="text-base leading-relaxed text-muted-foreground md:col-span-5 md:text-right">
          Базовое психологическое образование, профессиональная переподготовка
          и международная сертификация в коучинге.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
        {items.map((item, i) => (
          <figure
            key={item.title}
            className="group relative flex flex-col border border-hairline bg-background p-5 transition-all duration-500 hover:-translate-y-1"
            style={{ boxShadow: "var(--shadow-elegant)" }}
          >
            <div className="absolute -top-3 left-5 bg-background px-2 font-display text-xs tracking-[0.3em] text-accent">
              {String(i + 1).padStart(2, "0")}
            </div>
            <div className="relative overflow-hidden bg-muted">
              <img
                src={item.src}
                alt={`${item.title} — ${item.org}`}
                loading="lazy"
                className="h-72 w-full object-cover object-top transition-transform duration-700 group-hover:scale-[1.03]"
              />
            </div>
            <figcaption className="mt-5 flex flex-1 flex-col">
              <div className="text-[10px] uppercase tracking-[0.28em] text-accent">
                {item.type}
              </div>
              <div className="mt-2 font-display text-lg leading-tight text-foreground">
                {item.title}
              </div>
              <div className="mt-2 text-sm text-muted-foreground">{item.org}</div>
              <div className="mt-auto pt-4 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                {item.year}
              </div>
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  </section>
);
