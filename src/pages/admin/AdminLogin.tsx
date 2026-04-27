import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

export default function AdminLogin() {
  const { signIn, signUpWithEmailLink, resetPasswordForEmail, updatePassword, signOut, user, isStaff, profile, loading, profileLoading } =
    useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/admin/crm";
  const inRecoveryFlow = /(^|[&#?])type=recovery([&#]|$)/i.test(location.hash);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [activeTab, setActiveTab] = useState<"login" | "register">("login");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    if (inRecoveryFlow) return;
    if (!loading && !profileLoading && user && isStaff) {
      navigate(from, { replace: true });
    }
  }, [loading, profileLoading, user, isStaff, from, navigate, inRecoveryFlow]);

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

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await signUpWithEmailLink(registerEmail);
    setSubmitting(false);
    if (error) {
      toast.error(error.message || "Не удалось отправить письмо для регистрации");
      return;
    }
    toast.success("Ссылка для регистрации отправлена на почту");
  };

  const handleResetRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await resetPasswordForEmail(recoveryEmail);
    setSubmitting(false);
    if (error) {
      toast.error(error.message || "Не удалось отправить письмо для смены пароля");
      return;
    }
    toast.success("Письмо для смены пароля отправлено");
    setShowForgotPassword(false);
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      toast.error("Пароль должен быть не короче 6 символов");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Пароли не совпадают");
      return;
    }
    setSubmitting(true);
    const { error } = await updatePassword(newPassword);
    setSubmitting(false);
    if (error) {
      toast.error(error.message || "Не удалось обновить пароль");
      return;
    }
    setNewPassword("");
    setConfirmPassword("");
    toast.success("Пароль обновлён, теперь можно войти");
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="container-luxe flex min-h-screen flex-col items-center justify-center py-16">
        <div className="w-full max-w-sm space-y-8 rounded-sm border border-hairline bg-surface/30 p-8 shadow-sm">
          <div className="text-center">
            <h1 className="font-display text-2xl text-foreground">CRM</h1>
            <p className="mt-1 text-sm text-muted-foreground">{inRecoveryFlow ? "Смена пароля" : "Авторизация команды"}</p>
          </div>
          {inRecoveryFlow ? (
            <form onSubmit={handleUpdatePassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-pass">Новый пароль</Label>
                <Input
                  id="new-pass"
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="border-hairline bg-background"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-pass">Повторите пароль</Label>
                <Input
                  id="confirm-pass"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="border-hairline bg-background"
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? "Сохраняем…" : "Сменить пароль"}
              </Button>
            </form>
          ) : (
            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "login" | "register")}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">Авторизация</TabsTrigger>
                <TabsTrigger value="register">Регистрация</TabsTrigger>
              </TabsList>
              <TabsContent value="login">
                {showForgotPassword ? (
                  <form onSubmit={handleResetRequest} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="reset-email">Email</Label>
                      <Input
                        id="reset-email"
                        type="email"
                        autoComplete="email"
                        value={recoveryEmail}
                        onChange={(e) => setRecoveryEmail(e.target.value)}
                        className="border-hairline bg-background"
                        required
                      />
                    </div>
                    <Button type="submit" className="w-full" disabled={submitting}>
                      {submitting ? "Отправка…" : "Отправить ссылку"}
                    </Button>
                    <Button type="button" variant="ghost" className="w-full" onClick={() => setShowForgotPassword(false)}>
                      Назад ко входу
                    </Button>
                  </form>
                ) : (
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
                    <Button type="button" variant="ghost" className="w-full" onClick={() => setShowForgotPassword(true)}>
                      Забыли пароль?
                    </Button>
                  </form>
                )}
              </TabsContent>
              <TabsContent value="register">
                <form onSubmit={handleSignUp} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="register-email">Email</Label>
                    <Input
                      id="register-email"
                      type="email"
                      autoComplete="email"
                      value={registerEmail}
                      onChange={(e) => setRegisterEmail(e.target.value)}
                      className="border-hairline bg-background"
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={submitting}>
                    {submitting ? "Отправка…" : "Получить ссылку регистрации"}
                  </Button>
                  <p className="text-xs text-muted-foreground">На почту придет ссылка, по ней можно завершить регистрацию.</p>
                </form>
              </TabsContent>
            </Tabs>
          )}
          <a href="#/" className="block text-center text-xs text-muted-foreground hover:text-accent">
            На главную
          </a>
        </div>
      </div>
    </div>
  );
}
