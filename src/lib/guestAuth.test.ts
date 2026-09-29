import { describe, expect, it, vi } from "vitest";
import type { Session, User } from "@supabase/supabase-js";
import {
  GUEST_MODE_KEY,
  clearGuestFlag,
  ensureAnonymousSession,
  isAnonymousUser,
  isRegisteredSession,
  readGuestFlag,
  resolveAuthMode,
  retryGuestSessionIfNeeded,
  setGuestFlag,
  upgradeAnonymousAccount,
} from "./guestAuth";

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: "user-1",
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  } as User;
}

function makeSession(user: User): Session {
  return {
    access_token: "token",
    refresh_token: "refresh",
    expires_in: 3600,
    token_type: "bearer",
    user,
  } as Session;
}

const anonSession = makeSession(makeUser({ is_anonymous: true }));
const realSession = makeSession(makeUser({ email: "a@b.com", is_anonymous: false }));

type FakeAuth = {
  getSession: ReturnType<typeof vi.fn>;
  signInAnonymously: ReturnType<typeof vi.fn>;
  updateUser: ReturnType<typeof vi.fn>;
};

function makeClient(auth: Partial<FakeAuth> = {}) {
  const full: FakeAuth = {
    getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    signInAnonymously: vi
      .fn()
      .mockResolvedValue({ data: { session: anonSession, user: anonSession.user }, error: null }),
    updateUser: vi.fn(),
    ...auth,
  };
  // Only the auth methods under test are provided.
  return { client: { auth: full } as never, auth: full };
}

describe("isAnonymousUser / isRegisteredSession", () => {
  it("treats only is_anonymous === true as anonymous", () => {
    expect(isAnonymousUser(makeUser({ is_anonymous: true }))).toBe(true);
    expect(isAnonymousUser(makeUser({ is_anonymous: false }))).toBe(false);
    expect(isAnonymousUser(makeUser())).toBe(false);
    expect(isAnonymousUser(null)).toBe(false);
  });

  it("registered session excludes anonymous and missing sessions", () => {
    expect(isRegisteredSession(realSession)).toBe(true);
    expect(isRegisteredSession(anonSession)).toBe(false);
    expect(isRegisteredSession(null)).toBe(false);
  });
});

describe("resolveAuthMode (session wins over local flag)", () => {
  it("real session beats the guest flag", () => {
    expect(resolveAuthMode(realSession, true)).toBe("signed_in");
  });
  it("anonymous session beats the guest flag", () => {
    expect(resolveAuthMode(anonSession, true)).toBe("anonymous");
    expect(resolveAuthMode(anonSession, false)).toBe("anonymous");
  });
  it("falls back to the local flag only with no session", () => {
    expect(resolveAuthMode(null, true)).toBe("local_guest");
    expect(resolveAuthMode(null, false)).toBe("signed_out");
  });
});

describe("guest flag helpers", () => {
  it("set, read, clear round-trip on chefcoach_guest", () => {
    expect(readGuestFlag()).toBe(false);
    setGuestFlag();
    expect(window.localStorage.getItem(GUEST_MODE_KEY)).toBe("1");
    expect(readGuestFlag()).toBe(true);
    clearGuestFlag();
    expect(readGuestFlag()).toBe(false);
  });
});

describe("ensureAnonymousSession", () => {
  it("skips sign-in when any session already exists", async () => {
    const { client, auth } = makeClient({
      getSession: vi.fn().mockResolvedValue({ data: { session: realSession }, error: null }),
    });
    const result = await ensureAnonymousSession(client);
    expect(result).toEqual({ ok: true, session: realSession, skipped: true });
    expect(auth.signInAnonymously).not.toHaveBeenCalled();
  });

  it("signs in anonymously when there is no session", async () => {
    const { client, auth } = makeClient();
    const result = await ensureAnonymousSession(client);
    expect(auth.signInAnonymously).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: true, session: anonSession, skipped: false });
  });

  it("returns ok:false on a Supabase error", async () => {
    const { client } = makeClient({
      signInAnonymously: vi.fn().mockResolvedValue({
        data: { session: null, user: null },
        error: { message: "Anonymous sign-ins are disabled" },
      }),
    });
    const result = await ensureAnonymousSession(client);
    expect(result).toEqual({ ok: false, error: "Anonymous sign-ins are disabled" });
  });

  it("never throws when the network call rejects", async () => {
    const { client } = makeClient({
      signInAnonymously: vi.fn().mockRejectedValue(new Error("Failed to fetch")),
    });
    await expect(ensureAnonymousSession(client)).resolves.toEqual({
      ok: false,
      error: "Failed to fetch",
    });
  });

  it("never throws when getSession rejects", async () => {
    const { client } = makeClient({
      getSession: vi.fn().mockRejectedValue(new Error("storage broken")),
    });
    await expect(ensureAnonymousSession(client)).resolves.toEqual({
      ok: false,
      error: "storage broken",
    });
  });

  it("times out instead of hanging", async () => {
    vi.useFakeTimers();
    try {
      const { client } = makeClient({
        signInAnonymously: vi.fn().mockReturnValue(new Promise(() => {})),
      });
      const pending = ensureAnonymousSession(client, { timeoutMs: 1_000 });
      await vi.advanceTimersByTimeAsync(1_000);
      await expect(pending).resolves.toEqual({
        ok: false,
        error: "Anonymous sign-in timed out.",
      });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("retryGuestSessionIfNeeded (startup migration + pre-scan retry)", () => {
  it("does nothing when the guest flag is not set", async () => {
    const { client, auth } = makeClient();
    await expect(retryGuestSessionIfNeeded(client)).resolves.toBeNull();
    expect(auth.getSession).not.toHaveBeenCalled();
    expect(auth.signInAnonymously).not.toHaveBeenCalled();
  });

  it("signs in anonymously when flag is set and there is no session", async () => {
    setGuestFlag();
    const { client, auth } = makeClient();
    const result = await retryGuestSessionIfNeeded(client);
    expect(auth.signInAnonymously).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: true, session: anonSession, skipped: false });
  });

  it("does not replace an existing session even when flag is set", async () => {
    setGuestFlag();
    const { client, auth } = makeClient({
      getSession: vi.fn().mockResolvedValue({ data: { session: anonSession }, error: null }),
    });
    const result = await retryGuestSessionIfNeeded(client);
    expect(auth.signInAnonymously).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: true, skipped: true });
  });

  it("keeps the local flag when sign-in fails so the next retry can run", async () => {
    setGuestFlag();
    const { client } = makeClient({
      signInAnonymously: vi.fn().mockRejectedValue(new Error("offline")),
    });
    const result = await retryGuestSessionIfNeeded(client);
    expect(result).toEqual({ ok: false, error: "offline" });
    expect(readGuestFlag()).toBe(true);
  });
});

describe("upgradeAnonymousAccount (updateUser only, no linkIdentity)", () => {
  it("calls updateUser with trimmed email and password", async () => {
    const { client, auth } = makeClient({
      updateUser: vi.fn().mockResolvedValue({
        data: { user: makeUser({ email: "a@b.com", is_anonymous: false }) },
        error: null,
      }),
    });
    const result = await upgradeAnonymousAccount(client, "  a@b.com ", "secret123");
    expect(auth.updateUser).toHaveBeenCalledWith({ email: "a@b.com", password: "secret123" });
    expect(result).toEqual({ error: null, needsEmailConfirm: false });
  });

  it("reports needsEmailConfirm while the email change is pending", async () => {
    const { client } = makeClient({
      updateUser: vi.fn().mockResolvedValue({
        data: { user: makeUser({ is_anonymous: true, new_email: "a@b.com" }) },
        error: null,
      }),
    });
    const result = await upgradeAnonymousAccount(client, "a@b.com", "secret123");
    expect(result).toEqual({ error: null, needsEmailConfirm: true });
  });

  it("passes through the error message and code", async () => {
    const { client } = makeClient({
      updateUser: vi.fn().mockResolvedValue({
        data: { user: null },
        error: { message: "A user with this email address has already been registered", code: "email_exists" },
      }),
    });
    const result = await upgradeAnonymousAccount(client, "a@b.com", "secret123");
    expect(result).toEqual({
      error: "A user with this email address has already been registered",
      code: "email_exists",
    });
  });
});
