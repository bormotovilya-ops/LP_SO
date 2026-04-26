import { type PropsWithChildren } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { isSupabaseConfigured } from "@/lib/supabaseClient";

export function ProtectedCrmRoute({ children }: PropsWithChildren) {
  const { user, isStaff, loading, profile, profileLoading } = useAuth();
  const location = useLocation();

  if (!isSupabaseConfigured()) {
    return (
      <div className="container-luxe flex min-h-[50vh] items-center justify-center py-20">
        <p className="max-w-md text-center text-sm text-muted-foreground">
          CRM недоступна: в окружении не заданы <code className="text-foreground">VITE_SUPABASE_URL</code> и{" "}
          <code className="text-foreground">VITE_SUPABASE_ANON_KEY</code>.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
        Загрузка…
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  }

  if (profileLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
        Проверка доступа…
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="container-luxe flex min-h-[50vh] flex-col items-center justify-center gap-4 py-20">
        <p className="text-center text-sm text-muted-foreground">
          Учётная запись есть, но в CRM нет профиля. Обратитесь к администратору.
        </p>
      </div>
    );
  }

  if (!isStaff) {
    return (
      <div className="container-luxe flex min-h-[50vh] flex-col items-center justify-center gap-4 py-20">
        <p className="text-center text-sm text-muted-foreground">Нет прав доступа к CRM.</p>
      </div>
    );
  }

  return <>{children}</>;
}
