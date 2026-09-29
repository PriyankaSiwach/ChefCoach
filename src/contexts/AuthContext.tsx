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
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/lib/supabaseClient";
import { pullProfileFromSupabase } from "@/lib/profileSupabase";
import { clearProStatus } from "@/lib/proStatus";
import { resolveAuthEmail, storeAuthEmail } from "@/lib/trial";
import { clearAccountOnDevice, clearRecipifyLocalSession } from "@/lib/session";
import { deleteSupabaseAccount } from "@/lib/deleteAccount";
import { maybePromptNotificationPermissionAfterLogin } from "@/lib/notificationPermission";
import { revenueCatLogOut } from "@/lib/revenueCat";
import {
  defaultUserProfile,
  RECIPIFY_PROFILE_STORAGE_KEY,
} from "@/lib/profileStorage";
import {
  isAccountExistsAuthError,
  signUpIndicatesExistingAccount,
} from "@/lib/authErrors";
import {
  clearGuestFlag,
  ensureAnonymousSession,
  getOrCreateGuestId,
  isAnonymousUser,
  isRegisteredSession,
  readGuestFlag,
  retryGuestSessionIfNeeded,
  setGuestFlag,
  upgradeAnonymousAccount,
} from "@/lib/guestAuth";

const OAUTH_CALLBACK_SCHEME = "com.chefcoach.app://auth/callback";

function ensureGuestProfileInStorage(): void {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(RECIPIFY_PROFILE_STORAGE_KEY);
    if (!raw) {
      const fallback = { ...defaultUserProfile(), name: "Guest" };
      window.localStorage.setItem(
        RECIPIFY_PROFILE_STORAGE_KEY,
        JSON.stringify(fallback)
      );
      window.dispatchEvent(new CustomEvent("recipify-profile-sync"));
      return;
    }
    const parsed = JSON.parse(raw) as { name?: string };
    if (!parsed.name?.trim()) {
      parsed.name = "Guest";
      window.localStorage.setItem(RECIPIFY_PROFILE_STORAGE_KEY, JSON.stringify(parsed));
      window.dispatchEvent(new CustomEvent("recipify-profile-sync"));
    }
  } catch {
    /* ignore */
  }
}

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  initializing: boolean;
  /** True for an anonymous Supabase session, or local guest mode when there is no session. */
  isGuest: boolean;
  /** True when the current Supabase session belongs to an anonymous user. */
  isAnonymous: boolean;
  /** Guest's stable local ID used for RevenueCat customer identification. */
  guestId: string | null;
  continueAsGuest: () => void;
  /** Retry anonymous sign-in for a local-only guest. Never throws; resolves within a few seconds. */
  ensureGuestSession: () => Promise<void>;
  /** Turn the current anonymous user into an email/password account (same user ID). */
  upgradeGuest: (
    email: string,
    password: string
  ) => Promise<{
    error: string | null;
    code?: string | null;
    accountExists?: boolean;
    needsEmailConfirm?: boolean;
  }>;
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
  /** Permanently delete cloud account + wipe local data. Requires active session for signed-in users. */
  deleteAccount: () => Promise<{ ok: boolean; error?: string }>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);
  /** Local guest flag; only consulted when there is no session. */
  const [localGuest, setLocalGuest] = useState<boolean>(() => readGuestFlag());
  const [guestId, setGuestId] = useState<string | null>(() =>
    readGuestFlag() ? getOrCreateGuestId() : null
  );

  const isAnonymous = isAnonymousUser(session?.user);
  const isGuest = session ? isAnonymous : localGuest;

  const syncEmailForLegacyApis = useCallback((s: Session | null) => {
    if (typeof window === "undefined") return;
    // Anonymous users have no email; clearing the stored one stops them from
    // inheriting a previous account's email.
    const email = s?.user && !isAnonymousUser(s.user) ? resolveAuthEmail(s.user) : null;
    storeAuthEmail(email);
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

        // Legacy guests (local flag, no session): keep local guest mode for this
        // launch and silently upgrade to an anonymous session. SIGNED_IN will
        // replace local mode if it succeeds; on failure we retry next launch.
        if (!s && readGuestFlag()) {
          ensureGuestProfileInStorage();
          setLocalGuest(true);
          setGuestId(getOrCreateGuestId());
          void retryGuestSessionIfNeeded(supabase).then((result) => {
            if (result && !result.ok) {
              console.error("[Auth] Anonymous guest sign-in failed; staying in local guest mode:", result.error);
            }
          });
        }

        // Profile + subscription sync runs in background — don't block first paint
        void (async () => {
          try {
            if (s?.user?.id) {
              await pullProfileFromSupabase(s.user.id);
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
      if (event === "SIGNED_IN" && nextSession?.user?.id && isAnonymousUser(nextSession.user)) {
        // Guest received an anonymous session: stay a guest, keep the local flag,
        // and back the onboarding profile up to this user's row.
        const userId = nextSession.user.id;
        void pullProfileFromSupabase(userId).catch((e) => {
          console.warn("[Auth] Anonymous profile sync failed:", e);
        });
      } else if (event === "SIGNED_IN" && nextSession?.user?.id) {
        // Leaving guest mode — migrate local onboarding profile to the account.
        clearGuestFlag();
        setLocalGuest(false);
        setGuestId(null);

        const resolvedEmail = resolveAuthEmail(nextSession.user);
        storeAuthEmail(resolvedEmail);

        // Cache Apple/Google sign-in email in user metadata when missing
        if (resolvedEmail && !nextSession.user.user_metadata?.email) {
          void supabase.auth
            .updateUser({ data: { email: resolvedEmail } })
            .catch(() => {});
        }

        void (async () => {
          try {
            await pullProfileFromSupabase(nextSession.user.id);
          } catch (e) {
            console.warn("[Auth] Post sign-in sync failed:", e);
          }
        })();

        void maybePromptNotificationPermissionAfterLogin();
      }
      // Guest upgrade (updateUser email + password) completes: the same user is
      // no longer anonymous, so leave guest mode.
      if (event === "USER_UPDATED" && isRegisteredSession(nextSession) && readGuestFlag()) {
        clearGuestFlag();
        setLocalGuest(false);
        setGuestId(null);
        storeAuthEmail(resolveAuthEmail(nextSession.user));
      }
      if (event === "SIGNED_OUT") {
        clearRecipifyLocalSession();
        clearProStatus();
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

  // ── Native OAuth deep-link handler ───────────────────────────────────────────
  // Flow:
  //   1. LoginPage opens the Supabase OAuth URL in @capacitor/browser
  //      (SFSafariViewController — stays inside the app, never opens external Safari)
  //   2. Apple/Google redirects to com.chefcoach.app://auth/callback?code=...
  //   3. iOS intercepts the custom scheme, dismisses SFSafariViewController
  //   4. This listener fires, exchanges the PKCE code for a real session
  //   5. supabase.onAuthStateChange fires → user is signed in → app navigates
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    // PluginListenerHandle has a .remove() method — use it for targeted cleanup
    // instead of removeAllListeners() which would wipe unrelated listeners.
    let listenerHandle: { remove: () => Promise<void> } | null = null;
    let processing = false; // guard against double-fire

    const setup = async () => {
      try {
        const { App } = await import("@capacitor/app");

        listenerHandle = await App.addListener(
          "appUrlOpen",
          async ({ url }: { url: string }) => {
            // Only handle our own OAuth callback scheme
            if (!url.startsWith("com.chefcoach.app://")) return;
            if (processing) return;
            processing = true;

            const closeBrowser = async () => {
              try {
                const { Browser } = await import("@capacitor/browser");
                await Browser.close();
              } catch {
                /* browser may already be dismissed by iOS */
              }
            };

            try {
              // Prefer PKCE flow: ?code= in query params
              const parsed = new URL(url);
              const code = parsed.searchParams.get("code");
              const errorParam = parsed.searchParams.get("error");
              const errorDesc = parsed.searchParams.get("error_description");

              if (errorParam || errorDesc) {
                console.warn("[OAuth callback] Provider returned error:", errorDesc ?? errorParam);
                await closeBrowser();
                return;
              }

              if (code) {
                // PKCE: exchange the authorization code for a session.
                // The code_verifier was stored in localStorage when we called
                // signInWithOAuth({ skipBrowserRedirect: true }) in the app context.
                const { error } = await supabase.auth.exchangeCodeForSession(code);
                if (error) {
                  console.warn("[OAuth callback] exchangeCodeForSession failed:", error.message);
                }
                await closeBrowser();
                return;
              }

              // Implicit flow fallback: access_token in URL hash (rare with PKCE enabled)
              const hash = parsed.hash.slice(1);
              const hashParams = new URLSearchParams(hash);
              const accessToken = hashParams.get("access_token");
              const refreshToken = hashParams.get("refresh_token");
              if (accessToken && refreshToken) {
                const { error } = await supabase.auth.setSession({
                  access_token: accessToken,
                  refresh_token: refreshToken,
                });
                if (error) {
                  console.warn("[OAuth callback] setSession failed:", error.message);
                }
                await closeBrowser();
              }
            } catch (e) {
              console.warn("[OAuth callback] Unexpected error:", e);
              await closeBrowser();
            } finally {
              processing = false;
            }
          }
        );
      } catch (e) {
        console.warn("[OAuth] Failed to set up deep-link listener:", e);
      }
    };

    void setup();

    return () => {
      void listenerHandle?.remove();
    };
  }, []);

  const continueAsGuest = useCallback(() => {
    setGuestFlag();
    ensureGuestProfileInStorage();
    setLocalGuest(true);
    setGuestId(getOrCreateGuestId());
    // Local guest mode is usable immediately; SIGNED_IN swaps in the anonymous session.
    void ensureAnonymousSession(supabase).then((result) => {
      if (!result.ok) {
        console.error("[Auth] Anonymous guest sign-in failed; staying in local guest mode:", result.error);
      }
    });
  }, []);

  const ensureGuestSession = useCallback(async () => {
    const result = await retryGuestSessionIfNeeded(supabase, { timeoutMs: 5_000 });
    if (result && !result.ok) {
      console.error("[Auth] Anonymous guest sign-in retry failed:", result.error);
    }
  }, []);

  const upgradeGuest = useCallback(async (email: string, password: string) => {
    const result = await upgradeAnonymousAccount(supabase, email, password);
    if (result.error) {
      return {
        ...result,
        accountExists: isAccountExistsAuthError({
          message: result.error,
          code: result.code ?? undefined,
        }),
      };
    }
    return result;
  }, []);

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
    // Clear guest mode so next launch goes to login
    clearGuestFlag();
    setLocalGuest(false);
    setGuestId(null);

    clearRecipifyLocalSession();
    clearProStatus();
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

  const deleteAccount = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    const { data: sessionData } = await supabase.auth.getSession();
    const hasSession = Boolean(sessionData.session?.user?.id);

    if (hasSession) {
      const result = await deleteSupabaseAccount();
      if (!result.ok) {
        return result;
      }
    }

    clearGuestFlag();
    setLocalGuest(false);
    setGuestId(null);
    clearAccountOnDevice();
    clearProStatus();
    syncEmailForLegacyApis(null);
    setSession(null);
    window.dispatchEvent(new CustomEvent("recipify-profile-sync"));

    try {
      await supabase.auth.signOut({ scope: "global" });
    } catch (e) {
      console.warn("[Auth] signOut after delete failed:", e);
      try {
        await supabase.auth.signOut({ scope: "local" });
      } catch {
        /* ignore */
      }
    }

    void revenueCatLogOut().catch(() => {});
    return { ok: true };
  }, [syncEmailForLegacyApis]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      initializing,
      isGuest,
      isAnonymous,
      guestId,
      continueAsGuest,
      ensureGuestSession,
      upgradeGuest,
      signIn,
      signUp,
      signOut,
      deleteAccount,
    }),
    [
      session,
      initializing,
      isGuest,
      isAnonymous,
      guestId,
      continueAsGuest,
      ensureGuestSession,
      upgradeGuest,
      signIn,
      signUp,
      signOut,
      deleteAccount,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
