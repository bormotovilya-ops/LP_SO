import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";
import { ThemeSwitcher } from "@/components/landing/ThemeSwitcher";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

const navClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "text-xs uppercase tracking-[0.2em] transition-colors",
    isActive ? "text-accent" : "text-foreground/70 hover:text-foreground",
  );

export function CrmLayout() {
  const { signOut, profile, user, canWriteCrm } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <ThemeSwitcher />
      <header className="border-b border-hairline bg-surface/40 backdrop-blur-sm">
        <div className="container-luxe flex flex-wrap items-center justify-between gap-4 py-5">
          <div className="flex flex-wrap items-center gap-6">
            <a href="#/" className="font-display text-lg text-foreground transition-colors hover:text-accent">
              На сайт
            </a>
            <nav className="flex flex-wrap items-center gap-5">
              <NavLink to="/admin/crm" end className={navClass}>
                Дашборд
              </NavLink>
              <NavLink to="/admin/crm/contacts" className={navClass}>
                Контакты
              </NavLink>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-muted-foreground sm:inline">
              {profile?.display_name ?? user?.email}
              {canWriteCrm ? "" : " · только просмотр"}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 border-hairline text-xs"
              onClick={async () => {
                await signOut();
                navigate("/admin/login", { replace: true });
              }}
            >
              <LogOut className="mr-1.5 h-3.5 w-3.5" />
              Выйти
            </Button>
          </div>
        </div>
      </header>
      <main className="container-luxe py-8">
        <Outlet />
      </main>
    </div>
  );
}
