import { Capacitor } from "@capacitor/core";

/** Use VITE_API_BASE_URL (e.g. https://api.yourdomain.com) for iOS/Android builds so /api hits your backend. */
export function apiUrl(path: string): string {
  const base = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
  if (Capacitor.isNativePlatform()) {
    if (!base) {
      console.warn(
        "VITE_API_BASE_URL is not set; API calls may fail in the native app. Set it to your deployed API origin."
      );
      return path;
    }
    return `${base}${path.startsWith("/") ? path : `/${path}`}`;
  }
  return path;
}
