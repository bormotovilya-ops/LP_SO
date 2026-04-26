import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { KeyRound, Pencil, Menu, X } from "lucide-react";
import { toast } from "sonner";
import { Monogram } from "./Monogram";
import { SECTION_NAV } from "./navLinks";
import { useSiteEditor } from "@/components/SiteEditorProvider";
import { useAuth } from "@/contexts/AuthContext";
import { isSupabaseConfigured } from "@/lib/supabaseClient";

export const Header = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { isEditing, toggleEditing } = useSiteEditor();
  const navigate = useNavigate();
  const { user, isStaff, loading: authLoading, profileLoading, canEditSite } = useAuth();

  const goCrm = () => {
    if (authLoading || profileLoading) return;
    if (!isSupabaseConfigured()) {
      toast.error("CRM: не заданы VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY");
      return;
    }
    if (!user) {
      navigate("/admin/login");
      return;
    }
    if (isStaff) {
      navigate("/admin/crm");
      return;
    }
    toast.message("Нет доступа к CRM. Нужен профиль в crm_profiles.");
  };

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
        <div className="hidden items-center gap-2 md:flex">
          <a href="#contact" className="btn-brass !px-5 !py-3 !text-[11px]">
            Диагностика
          </a>
          {canEditSite ? (
            <button
              type="button"
              className={`inline-flex h-9 w-9 items-center justify-center rounded-sm border transition-opacity ${
                isEditing
                  ? "border-accent/80 bg-accent/10 text-accent"
                  : "border-hairline/50 text-foreground/40 opacity-70 hover:opacity-100"
              }`}
              data-site-editor-ignore="true"
              onClick={toggleEditing}
              aria-label={isEditing ? "Выйти из редактора" : "Редактор текста (карандаш)"}
              title={isEditing ? "Сохраните изменения в панели редактора" : "Редактировать тексты на странице"}
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          ) : null}
          <button
            type="button"
            className={`inline-flex h-9 w-9 items-center justify-center rounded-sm border transition-opacity ${
              isStaff && user
                ? "border-hairline/60 text-foreground/55 opacity-80 hover:opacity-100"
                : "border-hairline/40 text-foreground/35 opacity-60 hover:opacity-95"
            }`}
            data-site-editor-ignore="true"
            onClick={goCrm}
            aria-label="Вход в CRM (команда)"
            title="CRM для команды"
          >
            <KeyRound className="h-3.5 w-3.5" />
          </button>
        </div>
        <button
          type="button"
          aria-label={isMobileMenuOpen ? "Закрыть меню" : "Открыть меню"}
          aria-expanded={isMobileMenuOpen}
          aria-controls="mobile-menu-panel"
          className="inline-flex items-center justify-center rounded-sm border border-hairline p-2 text-foreground transition-colors hover:border-accent hover:text-accent md:hidden"
          onClick={() => setIsMobileMenuOpen((prev) => !prev)}
          data-site-editor-ignore="true"
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
            {canEditSite ? (
              <button
                type="button"
                className={`mt-3 inline-flex w-full items-center justify-center gap-2 rounded-sm border px-4 py-3 text-sm transition-opacity ${
                  isEditing
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-hairline/50 text-foreground/50"
                }`}
                onClick={() => {
                  toggleEditing();
                  setIsMobileMenuOpen(false);
                }}
                data-site-editor-ignore="true"
                aria-label="Редактор текста"
              >
                <Pencil className="h-4 w-4" />
                Редактор
              </button>
            ) : null}
            <button
              type="button"
              className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-sm border border-hairline/40 px-4 py-3 text-sm text-foreground/50"
              onClick={() => {
                goCrm();
                setIsMobileMenuOpen(false);
              }}
              data-site-editor-ignore="true"
              aria-label="CRM"
            >
              <KeyRound className="h-4 w-4" />
              CRM
            </button>
          </nav>
        </div>
      ) : null}
    </header>
  );
};
