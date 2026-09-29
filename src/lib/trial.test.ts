import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

vi.mock("@/lib/profileSupabase", () => ({
  patchLocalProfileScansUsed: vi.fn(),
}));

import {
  FREE_SCAN_LIMIT,
  FREE_TRACKER_SCAN_LIMIT,
  getScansUsed,
  getTrackerScansUsed,
  getTrialScansRemaining,
  isTrackerTrialExhausted,
  isTrialExhausted,
  recordScanUsed,
  recordTrackerScanUsed,
} from "@/lib/trial";

describe("trial local quota", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("starts with a full free Cook quota", () => {
    expect(getScansUsed()).toBe(0);
    expect(getTrialScansRemaining()).toBe(FREE_SCAN_LIMIT);
    expect(isTrialExhausted()).toBe(false);
  });

  it("exhausts Cook after 3 recordScanUsed calls", () => {
    recordScanUsed();
    recordScanUsed();
    expect(isTrialExhausted()).toBe(false);
    recordScanUsed();
    expect(getScansUsed()).toBe(3);
    expect(getTrialScansRemaining()).toBe(0);
    expect(isTrialExhausted()).toBe(true);
  });

  it("keeps Food Tracker quota independent from Cook", () => {
    recordScanUsed();
    recordScanUsed();
    recordScanUsed();
    expect(isTrialExhausted()).toBe(true);
    expect(isTrackerTrialExhausted()).toBe(false);

    recordTrackerScanUsed();
    recordTrackerScanUsed();
    recordTrackerScanUsed();
    expect(getTrackerScansUsed()).toBe(FREE_TRACKER_SCAN_LIMIT);
    expect(isTrackerTrialExhausted()).toBe(true);
  });

  it("migrates legacy remaining-count key to used-count", () => {
    window.localStorage.setItem("recipify_trial_scans", "1");
    expect(getScansUsed()).toBe(2);
    expect(window.localStorage.getItem("recipify_scans_used")).toBe("2");
    expect(window.localStorage.getItem("recipify_trial_scans")).toBeNull();
  });
});
