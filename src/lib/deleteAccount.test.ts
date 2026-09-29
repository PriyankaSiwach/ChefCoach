import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getSession, rpc, getUser } = vi.hoisted(() => ({
  getSession: vi.fn(),
  rpc: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock("@/lib/supabaseClient", () => ({
  supabase: { auth: { getSession, getUser }, rpc },
}));

import { deleteSupabaseAccount } from "./deleteAccount";

const anonSession = {
  access_token: "anon-token",
  user: { id: "anon-1", is_anonymous: true, user_metadata: {}, app_metadata: {} },
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  getSession.mockResolvedValue({ data: { session: anonSession } });
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  rpc.mockReset();
  getSession.mockReset();
  getUser.mockReset();
});

describe("deleteSupabaseAccount — anonymous guest", () => {
  it("deletes via the API with the anonymous token and skips email checks", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true }));

    await expect(deleteSupabaseAccount()).resolves.toEqual({ ok: true });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/auth/delete-account");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer anon-token");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("falls back to the delete RPC when the API is unavailable", async () => {
    fetchMock.mockResolvedValue(jsonResponse(503, {}));
    rpc.mockResolvedValue({ error: null });

    await expect(deleteSupabaseAccount()).resolves.toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("delete_own_account");
  });

  it("returns the setup hint when neither API nor RPC is configured", async () => {
    fetchMock.mockRejectedValue(new Error("network"));
    rpc.mockResolvedValue({ error: { code: "PGRST202", message: "Could not find the function" } });

    const result = await deleteSupabaseAccount();
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not configured/i);
  });

  it("surfaces a real failure instead of claiming success", async () => {
    fetchMock.mockResolvedValue(jsonResponse(500, { ok: false, error: "boom" }));
    rpc.mockResolvedValue({ error: { code: "XX000", message: "rpc failed" } });

    await expect(deleteSupabaseAccount()).resolves.toEqual({ ok: false, error: "rpc failed" });
  });
});

describe("deleteSupabaseAccount — no session", () => {
  it("still requires a signed-in user", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    const result = await deleteSupabaseAccount();
    expect(result).toEqual({ ok: false, error: "You must be signed in to delete your account." });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
