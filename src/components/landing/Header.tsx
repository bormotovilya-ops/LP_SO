import { useState } from "react";
import { Menu, X } from "lucide-react";
import { Monogram } from "./Monogram";
import { SECTION_NAV } from "./navLinks";

export const Header = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <header className="absolute left-0 right-0 top-0 z-40">
      <div className="container-luxe flex items-center justify-between py-6 md:py-8">
        <Monogram />
        <nav className="hidden flex-1 px-8 lg:block">
          <div className="grid grid-cols-6 items-center gap-4 xl:gap-5">
            {SECTION_NAV.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="link-underline text-center text-xs uppercase tracking-[0.2em] text-foreground/85 hover:text-accent"
              >
                {item.label}
              </a>
            ))}
          </div>
        </nav>
        <a href="#contact" className="hidden btn-brass md:inline-flex !px-5 !py-3 !text-[11px]">
          Диагностика
        </a>
        <button
          type="button"
          aria-label={isMobileMenuOpen ? "Закрыть меню" : "Открыть меню"}
          aria-expanded={isMobileMenuOpen}
          aria-controls="mobile-menu-panel"
          className="inline-flex items-center justify-center rounded-sm border border-hairline p-2 text-foreground transition-colors hover:border-accent hover:text-accent md:hidden"
          onClick={() => setIsMobileMenuOpen((prev) => !prev)}
        >
          {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>
      <div className="hairline mx-auto h-px w-full max-w-[1240px] opacity-60" />

      {isMobileMenuOpen ? (
        <div
          id="mobile-menu-panel"
          className="border-b border-hairline bg-surface/95 backdrop-blur-sm md:hidden"
        >
          <nav className="container-luxe py-4">
            <ul className="space-y-2">
              {SECTION_NAV.map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    className="block border-b border-hairline/60 py-2.5 font-display text-xl text-foreground transition-colors hover:text-accent"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
            <a
              href="#contact"
              className="mt-4 inline-flex w-full items-center justify-center btn-brass !px-5 !py-3 !text-[11px]"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              Диагностика
            </a>
          </nav>
        </div>
      ) : null}
    </header>
  );
};
