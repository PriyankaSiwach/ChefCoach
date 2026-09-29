import { afterEach, describe, expect, it, vi } from "vitest";

const { isNativePlatform } = vi.hoisted(() => ({ isNativePlatform: vi.fn(() => false) }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform } }));

import { apiUrl, BackendNotConfiguredError } from "./apiBase";

afterEach(() => {
  vi.unstubAllEnvs();
  isNativePlatform.mockReturnValue(false);
});

describe("apiUrl", () => {
  it("uses relative paths on web (Vite proxy / same origin)", () => {
    vi.stubEnv("VITE_API_BASE_URL", "https://api.example.com");
    expect(apiUrl("/api/vision/fridge")).toBe("/api/vision/fridge");
  });

  it("prefixes the configured origin on native", () => {
    isNativePlatform.mockReturnValue(true);
    vi.stubEnv("VITE_API_BASE_URL", "https://api.example.com/");
    expect(apiUrl("/api/vision/food")).toBe("https://api.example.com/api/vision/food");
    expect(apiUrl("api/cook-recipes")).toBe("https://api.example.com/api/cook-recipes");
  });

  it("throws a clear 'backend not configured' error on native without VITE_API_BASE_URL", () => {
    isNativePlatform.mockReturnValue(true);
    vi.stubEnv("VITE_API_BASE_URL", "   ");
    expect(() => apiUrl("/api/vision/fridge")).toThrow(BackendNotConfiguredError);
    expect(() => apiUrl("/api/vision/fridge")).toThrow(/backend not configured/i);
  });
});
