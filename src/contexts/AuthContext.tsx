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
import type { AuthError } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { pullProfileFromSupabase } from "@/lib/profileSupabase";
import { clearRecipifyLocalSession } from "@/lib/session";
import { revenueCatLogOut, syncRevenueCatUser } from "@/lib/revenueCat";
import {
  isAccountExistsAuthError,
  signUpIndicatesExistingAccount,
} from "@/lib/authErrors";

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  initializing: boolean;
  signIn: (
    email: string,
    password: string
  ) => Promise<{ error: string | null; code?: string | null }>;
  signUp: (
    email: string,
    password: string
  ) => Promise<{
    error: string | null;
    needsEmailConfirm?: boolean;
    accountExists?: boolean;
    code?: string | null;
  }>;
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

    // Safety net — never leave the app on a blank loading screen forever
    const initTimeout = window.setTimeout(() => {
      if (!cancelled) {
        console.warn("[Auth] Session init timed out — showing app UI");
        setInitializing(false);
      }
    }, 8000);

    const init = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        const s = data.session ?? null;
        setSession(s);
        syncEmailForLegacyApis(s);

        // Profile + subscription sync runs in background — don't block first paint
        void (async () => {
          try {
            if (s?.user?.id) {
              await pullProfileFromSupabase(s.user.id);
              await syncRevenueCatUser(s.user.id);
            } else {
              await syncRevenueCatUser(null);
            }
          } catch (e) {
            console.warn("[Auth] Background sync failed:", e);
          }
        })();
      } catch (e) {
        console.error("[Auth] Session init failed:", e);
      } finally {
        if (!cancelled) setInitializing(false);
      }
    };

    void init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      syncEmailForLegacyApis(nextSession);

      // Never await inside this listener — it can deadlock signOut (Supabase auth-js).
      if (event === "SIGNED_IN" && nextSession?.user?.id) {
        void (async () => {
          try {
            await pullProfileFromSupabase(nextSession.user.id);
            await syncRevenueCatUser(nextSession.user.id);
          } catch (e) {
            console.warn("[Auth] Post sign-in sync failed:", e);
          }
        })();
      }
      if (event === "SIGNED_OUT") {
        clearRecipifyLocalSession();
        void revenueCatLogOut().catch(() => {});
      }
      window.dispatchEvent(new CustomEvent("recipify-profile-sync"));
    });

    return () => {
      cancelled = true;
      window.clearTimeout(initTimeout);
      subscription.unsubscribe();
    };
  }, [syncEmailForLegacyApis]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      const authErr = error as AuthError;
      return { error: error.message, code: authErr.code ?? null };
    }
    return { error: null };
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });
    if (error) {
      const authErr = error as AuthError;
      return {
        error: error.message,
        code: authErr.code ?? null,
        accountExists: isAccountExistsAuthError(authErr),
      };
    }
    if (signUpIndicatesExistingAccount(data)) {
      return { error: null, accountExists: true };
    }
    if (data.user && !data.session) {
      return { error: null, needsEmailConfirm: true };
    }
    return { error: null };
  }, []);

  const signOut = useCallback(async () => {
    clearRecipifyLocalSession();
    syncEmailForLegacyApis(null);
    setSession(null);
    window.dispatchEvent(new CustomEvent("recipify-profile-sync"));

    try {
      await supabase.auth.signOut({ scope: "global" });
    } catch (e) {
      console.warn("[Auth] global signOut failed, clearing local session:", e);
      try {
        await supabase.auth.signOut({ scope: "local" });
      } catch {
        /* ignore */
      }
    }

    void revenueCatLogOut().catch(() => {});
  }, [syncEmailForLegacyApis]);

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
