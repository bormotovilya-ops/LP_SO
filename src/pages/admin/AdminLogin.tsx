import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function AdminLogin() {
  const { signIn, signOut, user, isStaff, profile, loading, profileLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/admin/crm";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    if (!loading && !profileLoading && user && isStaff) {
      navigate(from, { replace: true });
    }
  }, [loading, profileLoading, user, isStaff, from, navigate]);

  if (!isSupabaseConfigured()) {
    return (
      <div className="container-luxe flex min-h-screen flex-col items-center justify-center py-20">
        <p className="max-w-md text-center text-sm text-muted-foreground">
          Укажите в <code className="text-foreground">.env</code> (или в GitHub Actions Secrets){" "}
          <code className="text-foreground">SUPABASE_URL</code> и <code className="text-foreground">SUPABASE_ANON_KEY</code> — значения
          из Supabase → Settings → API. Затем снова <code className="text-foreground">npm run dev</code> или deploy.
        </p>
      </div>
    );
  }

  if (loading || profileLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Загрузка…</div>
    );
  }

  if (user && profile && !isStaff) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container-luxe flex min-h-screen flex-col items-center justify-center gap-4 py-16">
          <p className="text-center text-sm text-muted-foreground">Вход разрешён, но профиль неактивен или без роли CRM.</p>
          <Button
            type="button"
            variant="outline"
            onClick={async () => {
              await signOut();
            }}
          >
            Выйти
          </Button>
        </div>
      </div>
    );
  }

  if (user && !profile) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container-luxe flex min-h-screen flex-col items-center justify-center gap-4 py-16">
          <p className="text-center text-sm text-muted-foreground">Нет записи в crm_profiles. Обратитесь к администратору.</p>
          <Button
            type="button"
            variant="outline"
            onClick={async () => {
              await signOut();
            }}
          >
            Выйти
          </Button>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await signIn(email, password);
    setSubmitting(false);
    if (error) {
      toast.error(error.message || "Ошибка входа");
      return;
    }
    toast.success("Вход выполнен");
    navigate(from, { replace: true });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="container-luxe flex min-h-screen flex-col items-center justify-center py-16">
        <div className="w-full max-w-sm space-y-8 rounded-sm border border-hairline bg-surface/30 p-8 shadow-sm">
          <div className="text-center">
            <h1 className="font-display text-2xl text-foreground">CRM</h1>
            <p className="mt-1 text-sm text-muted-foreground">Вход для команды</p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="admin-email">Email</Label>
              <Input
                id="admin-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="border-hairline bg-background"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-pass">Пароль</Label>
              <Input
                id="admin-pass"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="border-hairline bg-background"
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Вход…" : "Войти"}
            </Button>
          </form>
          <a href="#/" className="block text-center text-xs text-muted-foreground hover:text-accent">
            На главную
          </a>
        </div>
      </div>
    </div>
  );
}
