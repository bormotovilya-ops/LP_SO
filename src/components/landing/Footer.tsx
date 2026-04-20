import { Link } from "react-router-dom";
import { Instagram, MessageCircle, Send, Youtube } from "lucide-react";
import { Monogram } from "./Monogram";
import { FOOTER_LEGAL_LINKS, FOOTER_NAV_EXTRA, SECTION_NAV } from "./navLinks";

const FOOTER_NAV = [...SECTION_NAV, ...FOOTER_NAV_EXTRA];

const VkIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    className={className}
  >
    <path d="M12.79 17c-6.25 0-9.82-4.29-9.97-11.42h3.13c.1 5.24 2.41 7.46 4.24 7.92V5.58h2.94v4.52c1.81-.2 3.7-2.25 4.34-4.52h2.94c-.49 2.8-2.54 4.85-4 5.69 1.46.68 3.79 2.45 4.68 5.73h-3.24c-.7-2.18-2.43-3.86-4.72-4.09V17h-.34Z" />
  </svg>
);

const SOCIALS = [
  { label: "Instagram", href: "https://www.instagram.com/svetlana.ozhgi/", icon: Instagram },
  { label: "VK", href: "https://vk.com/id457546762", icon: VkIcon },
  { label: "Telegram", href: "https://t.me/svetlana_ozhgi", icon: Send },
  { label: "YouTube", href: "https://www.youtube.com/@o_sveta_zhgi", icon: Youtube },
  { label: "WhatsApp", href: "https://wa.me/79388768974", icon: MessageCircle },
];

const footerLinkClass = "link-underline text-foreground/85 transition-colors hover:text-accent";

export const Footer = () => (
  <footer className="bg-surface pb-10 pt-16 md:pt-20">
    <div className="container-luxe">
      <div className="border-b border-hairline pb-10">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-2 lg:grid-cols-[1.25fr_1fr_1fr_1fr] lg:items-start lg:gap-x-10 xl:gap-x-12">
          <div className="max-w-sm lg:max-w-none lg:pr-4">
            <Monogram />
            <p className="mt-6 max-w-md text-sm leading-relaxed text-muted-foreground">
              Бизнес-психолог и наставник для женщин. Работаю с состояниями, опорой на себя
              и устойчивым ростом — без обещаний «волшебной таблетки».
            </p>
          </div>

          <div>
            <div className="eyebrow mb-5">Документы</div>
            <ul className="space-y-3 text-sm">
              {FOOTER_LEGAL_LINKS.map((item) => (
                <li key={item.href}>
                  <Link to={item.href} className={footerLinkClass}>
                    {item.href === "/privacy" ? (
                      <span className="inline-block leading-snug">
                        Политика в отношении
                        <br />
                        обработки персональных
                        <br />
                        данных
                      </span>
                    ) : (
                      item.label
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <div className="eyebrow mb-5">Соцсети</div>
            <ul className="space-y-3 text-sm">
              {SOCIALS.map((s) => (
                <li key={s.label}>
                  <a
                    href={s.href}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2.5 text-foreground/85 transition-colors hover:text-accent"
                  >
                    {"icon" in s && s.icon ? (
                      <s.icon className="h-3.5 w-3.5 shrink-0" />
                    ) : null}
                    <span className="link-underline">{s.label}</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <div className="eyebrow mb-5">Навигация</div>
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
        </div>
      </div>

      <div className="mt-10 flex flex-col items-start justify-between gap-4 pt-8 text-[11px] uppercase tracking-[0.22em] text-muted-foreground sm:flex-row sm:items-center">
        <span>© {new Date().getFullYear()} Светлана Ожгихина</span>
        <span className="sm:text-right">Психология глубокой трансформации</span>
      </div>
    </div>
  </footer>
);
