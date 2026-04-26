import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import type { CrmProfileRow, CrmRole } from "@/types/crm";

type AuthState = {
  session: Session | null;
  user: User | null;
  profile: CrmProfileRow | null;
  loading: boolean;
  profileLoading: boolean;
};

type AuthContextValue = AuthState & {
  isStaff: boolean;
  canWriteCrm: boolean;
  canEditSite: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function isStaffRole(role: CrmRole | undefined | null): boolean {
  return role === "admin" || role === "manager" || role === "viewer";
}

function canWriteRole(role: CrmRole | undefined | null): boolean {
  return role === "admin" || role === "manager";
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<CrmProfileRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);

  const loadProfile = useCallback(async (uid: string) => {
    if (!isSupabaseConfigured()) {
      setProfile(null);
      return;
    }
    setProfileLoading(true);
    const supabase = getSupabase();
    const { data, error } = await supabase.from("crm_profiles").select("*").eq("id", uid).maybeSingle();
    setProfileLoading(false);
    if (error) {
      setProfile(null);
      return;
    }
    setProfile((data as CrmProfileRow) ?? null);
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setLoading(false);
      return;
    }
    const supabase = getSupabase();

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user?.id) {
        void loadProfile(s.user.id);
      }
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user?.id) {
        void loadProfile(s.user.id);
      } else {
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [loadProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!isSupabaseConfigured()) {
      return { error: new Error("Supabase: задайте SUPABASE_URL / SUPABASE_ANON_KEY (или VITE_*)") };
    }
    const supabase = getSupabase();
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    return { error: error as Error | null };
  }, []);

  const signOut = useCallback(async () => {
    if (!isSupabaseConfigured()) return;
    const supabase = getSupabase();
    await supabase.auth.signOut();
    setProfile(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user?.id) await loadProfile(user.id);
  }, [loadProfile, user?.id]);

  const value = useMemo<AuthContextValue>(() => {
    const r = profile?.role;
    return {
      session,
      user,
      profile,
      loading,
      profileLoading,
      isStaff: Boolean(profile?.is_active && isStaffRole(r)),
      canWriteCrm: Boolean(profile?.is_active && canWriteRole(r)),
      canEditSite: Boolean(profile?.is_active && canWriteRole(r)),
      signIn,
      signOut,
      refreshProfile,
    };
  }, [session, user, profile, loading, profileLoading, signIn, signOut, refreshProfile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
