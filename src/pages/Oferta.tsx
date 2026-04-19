import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Footer } from "@/components/landing/Footer";
import { Monogram } from "@/components/landing/Monogram";
import { ThemeSwitcher } from "@/components/landing/ThemeSwitcher";
import { OfertaBody } from "./OfertaBody";

const Oferta = () => {
  useEffect(() => {
    const prev = document.title;
    document.title = "Договор-оферта — Светлана Ожгихина";
    return () => {
      document.title = prev;
    };
  }, []);

  return (
    <main className="relative min-h-screen bg-background text-foreground">
      <ThemeSwitcher />
      <header className="sticky top-0 z-40 border-b border-hairline bg-background/90 backdrop-blur-md">
        <div className="container-luxe flex items-center justify-between gap-4 py-5 md:py-6">
          <Link to="/" className="inline-flex min-w-0 items-center" aria-label="На главную">
            <Monogram />
          </Link>
          <Link
            to="/"
            className="shrink-0 text-[11px] uppercase tracking-[0.22em] text-muted-foreground transition-colors hover:text-accent"
          >
            На главную
          </Link>
        </div>
      </header>

      <div className="container-luxe max-w-3xl py-14 md:py-20">
        <div className="mb-10 border-b border-hairline pb-10">
          <div className="mb-4 flex items-center gap-4">
            <span className="hairline h-px w-10" />
            <span className="eyebrow">Правовая информация</span>
          </div>
          <h1 className="font-display text-3xl leading-[1.15] text-foreground md:text-5xl">
            Договор-оферта
            <span className="mt-2 block text-xl font-normal italic text-accent md:text-2xl">
              об оказании платных образовательных услуг с применением дистанционных технологий
            </span>
          </h1>
          <p className="mt-6 text-sm text-muted-foreground md:text-base">
            г. Сочи · редакция от 28.02.2025 г.
          </p>
          <p className="mt-8 text-sm leading-relaxed text-foreground md:text-base">
            Настоящий документ является публичной офертой{" "}
            <strong>индивидуального предпринимателя Ожгихиной Светланы Евгеньевны</strong> (ИНН{" "}
            <strong>026407667105</strong>, ОГРНИП <strong>325237500078054</strong>), именуемого в дальнейшем
            «Исполнитель», в адрес полностью дееспособного физического лица — «Заказчик» — о заключении договора
            возмездного оказания услуг на условиях ниже.
          </p>
        </div>

        <OfertaBody />

        <p className="mt-12 border-t border-hairline pt-8 text-center text-sm text-muted-foreground">
          См. также{" "}
          <Link to="/privacy" className="text-accent underline-offset-2 hover:underline">
            политику конфиденциальности
          </Link>
          .
        </p>
      </div>

      <Footer />
    </main>
  );
};

export default Oferta;
