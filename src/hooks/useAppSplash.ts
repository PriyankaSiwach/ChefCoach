import { useEffect, useRef, useState } from "react";

const MIN_SPLASH_MS = 2200;

/**
 * Keeps splash visible for at least MIN_SPLASH_MS and until auth init finishes.
 */
export function useAppSplash(authInitializing: boolean) {
  const mountTime = useRef(Date.now());
  const [phase, setPhase] = useState<"visible" | "exiting" | "hidden">("visible");
  const exitStarted = useRef(false);

  useEffect(() => {
    if (authInitializing || exitStarted.current) return;

    const elapsed = Date.now() - mountTime.current;
    const remaining = Math.max(0, MIN_SPLASH_MS - elapsed);

    const timer = window.setTimeout(() => {
      exitStarted.current = true;
      setPhase("exiting");
    }, remaining);

    return () => window.clearTimeout(timer);
  }, [authInitializing]);

  const onExited = () => setPhase("hidden");

  return {
    show: phase !== "hidden",
    exiting: phase === "exiting",
    onExited,
  };
}
