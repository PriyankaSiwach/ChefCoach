import { Capacitor } from "@capacitor/core";

export const BACKEND_NOT_CONFIGURED_MESSAGE =
  "Backend not configured: this build has no VITE_API_BASE_URL, so the app can't reach the ChefCoach server.";

export class BackendNotConfiguredError extends Error {
  constructor() {
    super(BACKEND_NOT_CONFIGURED_MESSAGE);
    this.name = "BackendNotConfiguredError";
  }
}

/**
 * Use VITE_API_BASE_URL (e.g. https://api.yourdomain.com) for iOS/Android builds so /api hits your backend.
 * Native builds without it throw: a relative path would resolve against capacitor://localhost.
 */
export function apiUrl(path: string): string {
  if (!Capacitor.isNativePlatform()) return path;
  const base = (import.meta.env.VITE_API_BASE_URL || "").trim().replace(/\/$/, "");
  if (!base) throw new BackendNotConfiguredError();
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
