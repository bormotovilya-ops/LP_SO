import { Monogram } from "./Monogram";
import { SECTION_NAV } from "./navLinks";

export const Header = () => (
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
    </div>
    <div className="hairline mx-auto h-px w-full max-w-[1240px] opacity-60" />
  </header>
);
