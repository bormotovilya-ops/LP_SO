import { Monogram } from "./Monogram";

const SOCIALS = [
  { label: "Instagram", href: "#" },
  { label: "VK", href: "#" },
  { label: "Telegram", href: "#" },
  { label: "Дзен", href: "#" },
  { label: "TenChat", href: "#" },
];

export const Footer = () => (
  <footer className="bg-surface pb-10 pt-20">
    <div className="container-luxe">
      <div className="grid grid-cols-1 gap-12 border-b border-hairline pb-16 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <Monogram />
          <p className="mt-6 max-w-sm text-sm leading-relaxed text-muted-foreground">
            Бизнес-психолог и наставник для женщин. Работаю с состояниями, опорой на себя
            и устойчивым ростом — без обещаний «волшебной таблетки».
          </p>
        </div>

        <div className="lg:col-span-3">
          <div className="eyebrow mb-5">Навигация</div>
          <ul className="space-y-3 text-sm">
            <li><a href="#about" className="link-underline text-foreground/85">Обо мне</a></li>
            <li><a href="#products" className="link-underline text-foreground/85">Услуги</a></li>
            <li><a href="#method" className="link-underline text-foreground/85">Метод</a></li>
            <li><a href="#test" className="link-underline text-foreground/85">Тест</a></li>
            <li><a href="#contact" className="link-underline text-foreground/85">Диагностика</a></li>
          </ul>
        </div>

        <div className="lg:col-span-4">
          <div className="eyebrow mb-5">Соцсети</div>
          <ul className="space-y-3 text-sm">
            {SOCIALS.map((s) => (
              <li key={s.label}>
                <a
                  href={s.href}
                  className="flex items-center justify-between border-b border-hairline/60 py-2 text-foreground/85 transition-colors hover:border-accent hover:text-accent"
                >
                  <span>{s.label}</span>
                  <span className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                    Перейти →
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-8 flex flex-col items-start justify-between gap-4 text-[11px] uppercase tracking-[0.22em] text-muted-foreground md:flex-row md:items-center">
        <span>© {new Date().getFullYear()} Светлана Ожгихина</span>
        <span>Психология глубокой трансформации</span>
      </div>
    </div>
  </footer>
);
