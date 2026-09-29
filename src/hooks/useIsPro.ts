import { useEffect, useState } from "react";
import { isProActive, SUBSCRIPTION_CHANGED_EVENT } from "@/lib/proStatus";

/** Re-checks Pro when the server/SDK answer changes, in other tabs, and once a minute (expiry). */
export function useIsPro(userId: string | null | undefined): boolean {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const bump = () => setTick((t) => t + 1);
    window.addEventListener(SUBSCRIPTION_CHANGED_EVENT, bump);
    window.addEventListener("storage", bump);
    const interval = window.setInterval(bump, 60_000);
    return () => {
      window.removeEventListener(SUBSCRIPTION_CHANGED_EVENT, bump);
      window.removeEventListener("storage", bump);
      window.clearInterval(interval);
    };
  }, []);

  return isProActive(userId);
}
