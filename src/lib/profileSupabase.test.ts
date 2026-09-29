import { afterEach, describe, expect, it, vi } from "vitest";
import type { UserProfile } from "@/types";

const { upsert, maybeSingle } = vi.hoisted(() => ({
  upsert: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    from: () => ({
      upsert,
      select: () => ({ eq: () => ({ maybeSingle }) }),
    }),
    rpc: vi.fn(async () => ({ error: null })),
  },
}));

import { defaultUserProfile, RECIPIFY_PROFILE_STORAGE_KEY } from "./profileStorage";
import { syncProfileAfterAuth, toCloudProfile, upsertProfileToSupabase } from "./profileSupabase";

const AVATAR = "data:image/jpeg;base64,/9j/AVATAR";

function profile(overrides: Partial<UserProfile> = {}): UserProfile {
  return { ...defaultUserProfile(), name: "Priya", ...overrides };
}

afterEach(() => {
  upsert.mockReset();
  maybeSingle.mockReset();
});

describe("avatar stays on the device", () => {
  it("toCloudProfile drops avatarDataUri and keeps everything else", () => {
    const cloud = toCloudProfile(profile({ avatarDataUri: AVATAR }));
    expect(cloud).not.toHaveProperty("avatarDataUri");
    expect(cloud.name).toBe("Priya");
  });

  it("upsertProfileToSupabase never sends the avatar", async () => {
    upsert.mockResolvedValue({ error: null });
    await upsertProfileToSupabase("user-1", profile({ avatarDataUri: AVATAR }));

    const [row] = upsert.mock.calls[0] as [{ profile_data: Record<string, unknown> }];
    expect(row.profile_data).not.toHaveProperty("avatarDataUri");
    expect(JSON.stringify(row)).not.toContain("AVATAR");
  });

  it("sync keeps the local avatar and ignores an old avatar still in the cloud", async () => {
    window.localStorage.setItem(
      RECIPIFY_PROFILE_STORAGE_KEY,
      JSON.stringify(profile({ avatarDataUri: AVATAR }))
    );
    maybeSingle.mockResolvedValue({
      data: { profile_data: profile({ avatarDataUri: "data:image/jpeg;base64,/9j/OLDCLOUD" }) },
      error: null,
    });
    upsert.mockResolvedValue({ error: null });

    await syncProfileAfterAuth("user-1", null);

    const stored = JSON.parse(window.localStorage.getItem(RECIPIFY_PROFILE_STORAGE_KEY) ?? "{}");
    expect(stored.avatarDataUri).toBe(AVATAR);
    const [row] = upsert.mock.calls[0] as [{ profile_data: Record<string, unknown> }];
    expect(row.profile_data).not.toHaveProperty("avatarDataUri");
  });

  it("a new device does not download the cloud avatar", async () => {
    maybeSingle.mockResolvedValue({
      data: { profile_data: profile({ avatarDataUri: "data:image/jpeg;base64,/9j/OLDCLOUD" }) },
      error: null,
    });
    upsert.mockResolvedValue({ error: null });

    await syncProfileAfterAuth("user-1", null);

    const stored = JSON.parse(window.localStorage.getItem(RECIPIFY_PROFILE_STORAGE_KEY) ?? "{}");
    expect(stored.avatarDataUri ?? null).toBeNull();
  });
});
