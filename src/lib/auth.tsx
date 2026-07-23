import { createContext, useContext, useEffect, useState, useMemo, useCallback, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type Profile = { id: string; name: string; avatar_url: string | null; badge: string };
type Role = "admin" | "supervisor" | "worker";

type AuthCtx = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  roles: Role[];
  isSupervisor: boolean;
  isAdmin: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (uid: string) => {
    try {
      const [{ data: p }, { data: r }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", uid).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", uid),
      ]);
      setProfile(p as Profile | null);
      setRoles(((r ?? []) as { role: Role }[]).map((x) => x.role));
    } catch (err) {
      console.error("[Auth] Error loading profile:", err);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    // Get initial session
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      if (data.session?.user) {
        loadProfile(data.session.user.id).finally(() => {
          if (mounted) setLoading(false);
        });
      } else {
        setLoading(false);
      }
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_evt, s) => {
      if (!mounted) return;
      setSession(s);
      if (s?.user) {
        await loadProfile(s.user.id);
      } else {
        setProfile(null);
        setRoles([]);
      }
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signOut = useCallback(async () => {
    setLoading(true);
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    setRoles([]);
    setLoading(false);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (session?.user) await loadProfile(session.user.id);
  }, [session?.user, loadProfile]);

  const value: AuthCtx = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      roles,
      isSupervisor: roles.includes("admin") || roles.includes("supervisor"),
      isAdmin: roles.includes("admin"),
      loading,
      signOut,
      refreshProfile,
    }),
    [session, profile, roles, loading, signOut, refreshProfile]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth outside AuthProvider");
  return c;
}
