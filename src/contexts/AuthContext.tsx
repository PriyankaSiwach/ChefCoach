import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient.js";
import { pullProfileFromSupabase } from "@/lib/profileSupabase";
import { clearRecipifyLocalSession } from "@/lib/session";
import { revenueCatLogOut, syncRevenueCatUser } from "@/lib/revenueCat";

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  initializing: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string) => Promise<{ error: string | null; needsEmailConfirm?: boolean }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);

  const syncEmailForLegacyApis = useCallback((s: Session | null) => {
    if (typeof window === "undefined") return;
    try {
      const email = s?.user?.email;
      if (email) window.localStorage.setItem("recipify_email", email);
      else window.localStorage.removeItem("recipify_email");
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      const s = data.session ?? null;
      setSession(s);
      syncEmailForLegacyApis(s);
      if (s?.user?.id) {
        await pullProfileFromSupabase(s.user.id);
        await syncRevenueCatUser(s.user.id);
      } else {
        await syncRevenueCatUser(null);
      }
      if (!cancelled) setInitializing(false);
    };

    void init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, nextSession) => {
      setSession(nextSession);
      syncEmailForLegacyApis(nextSession);
      if (event === "SIGNED_IN" && nextSession?.user?.id) {
        await pullProfileFromSupabase(nextSession.user.id);
        await syncRevenueCatUser(nextSession.user.id);
      }
      if (event === "SIGNED_OUT") {
        await revenueCatLogOut();
        clearRecipifyLocalSession();
      }
      window.dispatchEvent(new CustomEvent("recipify-profile-sync"));
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [syncEmailForLegacyApis]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) return { error: error.message };
    return { error: null };
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });
    if (error) return { error: error.message };
    if (data.user && !data.session) {
      return { error: null, needsEmailConfirm: true };
    }
    return { error: null };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    window.dispatchEvent(new CustomEvent("recipify-profile-sync"));
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      initializing,
      signIn,
      signUp,
      signOut,
    }),
    [session, initializing, signIn, signUp, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
