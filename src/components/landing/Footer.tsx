import { Link } from "react-router-dom";
import { Monogram } from "./Monogram";
import { FOOTER_LEGAL_LINKS, FOOTER_NAV_EXTRA, SECTION_NAV } from "./navLinks";

const FOOTER_NAV = [...SECTION_NAV, ...FOOTER_NAV_EXTRA];

const SOCIALS = [
  { label: "Instagram", href: "https://www.instagram.com/svetlana.ozhgi/" },
  { label: "VK", href: "https://vk.com/id457546762" },
  { label: "Telegram", href: "https://t.me/svetlana_ozhgi" },
  { label: "YouTube", href: "https://www.youtube.com/@o_sveta_zhgi" },
  { label: "WhatsApp", href: "https://wa.me/79388768974" },
];

const footerLinkClass = "link-underline text-foreground/85 transition-colors hover:text-accent";

export const Footer = () => (
  <footer className="bg-surface pb-10 pt-20">
    <div className="container-luxe">
      <div className="grid grid-cols-1 gap-12 border-b border-hairline pb-16 lg:grid-cols-12 lg:gap-x-10 lg:gap-y-0">
        <div className="lg:col-span-4">
          <Monogram />
          <p className="mt-6 max-w-md text-sm leading-relaxed text-muted-foreground">
            Бизнес-психолог и наставник для женщин. Работаю с состояниями, опорой на себя
            и устойчивым ростом — без обещаний «волшебной таблетки».
          </p>
        </div>

        <div className="lg:col-span-2">
          <div className="eyebrow mb-5 min-h-[1.25em]">Навигация</div>
          <ul className="space-y-3 text-sm">
            {FOOTER_NAV.map((item) => (
              <li key={item.href}>
                {item.href.startsWith("/") ? (
                  <Link to={item.href} className={footerLinkClass}>
                    {item.label}
                  </Link>
                ) : (
                  <a href={item.href} className={footerLinkClass}>
                    {item.label}
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div className="lg:col-span-3">
          <div className="eyebrow mb-5 min-h-[1.25em]">Документы</div>
          <ul className="space-y-3 text-sm">
            {FOOTER_LEGAL_LINKS.map((item) => (
              <li key={item.href}>
                <Link to={item.href} className={footerLinkClass}>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="lg:col-span-3">
          <div className="eyebrow mb-5 min-h-[1.25em]">Соцсети</div>
          <ul className="space-y-3 text-sm">
            {SOCIALS.map((s) => (
              <li key={s.label}>
                <a href={s.href} target="_blank" rel="noreferrer" className={footerLinkClass}>
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-10 flex flex-col items-start justify-between gap-4 border-t border-hairline/80 pt-8 text-[11px] uppercase tracking-[0.22em] text-muted-foreground sm:flex-row sm:items-center">
        <span>© {new Date().getFullYear()} Светлана Ожгихина</span>
        <span className="sm:text-right">Психология глубокой трансформации</span>
      </div>
    </div>
  </footer>
);
