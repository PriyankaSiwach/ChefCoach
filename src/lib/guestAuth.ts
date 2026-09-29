import type { AuthError, Session, SupabaseClient, User } from "@supabase/supabase-js";

/** Legacy local guest flag. Only consulted when there is no Supabase session. */
export const GUEST_MODE_KEY = "chefcoach_guest";
export const GUEST_ID_KEY = "chefcoach_guest_id";

/**
 * Priority, highest first: a real session, an anonymous session, the local
 * guest flag, then signed out. A session always wins over the flag.
 */
export type AuthMode = "signed_in" | "anonymous" | "local_guest" | "signed_out";

export function isAnonymousUser(user: User | null | undefined): boolean {
  return user?.is_anonymous === true;
}

/** A session that belongs to a registered (non-anonymous) account. */
export function isRegisteredSession(session: Session | null | undefined): session is Session {
  return Boolean(session?.user) && !isAnonymousUser(session?.user);
}

export function resolveAuthMode(session: Session | null, localGuestFlag: boolean): AuthMode {
  if (session?.user) return isAnonymousUser(session.user) ? "anonymous" : "signed_in";
  return localGuestFlag ? "local_guest" : "signed_out";
}

export function readGuestFlag(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(GUEST_MODE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setGuestFlag(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(GUEST_MODE_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function clearGuestFlag(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(GUEST_MODE_KEY);
  } catch {
    /* ignore */
  }
}

/** Stable device-local ID used for RevenueCat while a guest has no Supabase user. */
export function getOrCreateGuestId(): string {
  if (typeof window === "undefined") return "guest";
  let id = window.localStorage.getItem(GUEST_ID_KEY);
  if (!id) {
    id = `guest_${Math.random().toString(36).slice(2, 10)}_${Date.now()}`;
    window.localStorage.setItem(GUEST_ID_KEY, id);
  }
  return id;
}

type AuthClient = Pick<SupabaseClient, "auth">;

export type AnonymousSignInResult =
  | { ok: true; session: Session | null; skipped: boolean }
  | { ok: false; error: string };

/**
 * Give a guest an anonymous Supabase session unless one (anonymous or real)
 * already exists. Never throws; on failure the caller keeps local guest mode.
 */
export async function ensureAnonymousSession(
  client: AuthClient,
  { timeoutMs = 8_000 }: { timeoutMs?: number } = {}
): Promise<AnonymousSignInResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const { data } = await client.auth.getSession();
    if (data.session) return { ok: true, session: data.session, skipped: true };

    const attempt = client.auth.signInAnonymously();
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Anonymous sign-in timed out.")), timeoutMs);
    });
    const { data: signIn, error } = await Promise.race([attempt, timeout]);
    if (error) return { ok: false, error: error.message };
    return { ok: true, session: signIn.session ?? null, skipped: false };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Anonymous sign-in failed." };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Startup migration and pre-scan retry: only acts for guests (local flag set)
 * that have no session yet.
 */
export async function retryGuestSessionIfNeeded(
  client: AuthClient,
  options?: { timeoutMs?: number }
): Promise<AnonymousSignInResult | null> {
  if (!readGuestFlag()) return null;
  return ensureAnonymousSession(client, options);
}

export type GuestUpgradeResult = {
  error: string | null;
  code?: string | null;
  /** Supabase sent a confirmation email; the account stays anonymous until it is clicked. */
  needsEmailConfirm?: boolean;
};

/**
 * Convert the current anonymous user into an email/password account. The user
 * ID is unchanged, so profile, scans, and purchases carry over.
 */
export async function upgradeAnonymousAccount(
  client: AuthClient,
  email: string,
  password: string
): Promise<GuestUpgradeResult> {
  const { data, error } = await client.auth.updateUser({ email: email.trim(), password });
  if (error) {
    return { error: error.message, code: (error as AuthError).code ?? null };
  }
  const user = data.user;
  const needsEmailConfirm = Boolean(user?.new_email) || isAnonymousUser(user);
  return { error: null, needsEmailConfirm };
}
