"use client";

import { useEffect, useState } from "react";
import {
  migrateLegacyProfileStorage,
  normalizeUserProfile,
  RECIPIFY_PROFILE_STORAGE_KEY,
} from "@/lib/profileStorage";
export function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      if (key === RECIPIFY_PROFILE_STORAGE_KEY) {
        migrateLegacyProfileStorage();
      }
      const raw = window.localStorage.getItem(key);
      if (raw !== null) {
        let parsed = JSON.parse(raw) as T;
        if (key === RECIPIFY_PROFILE_STORAGE_KEY) {
          const n = normalizeUserProfile(parsed as unknown);
          if (n) parsed = n as T;
        }
        setValue(parsed);
      }
    } catch {
      // ignore read errors
    } finally {
      setReady(true);
    }
  }, [key]);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // ignore write errors
    }
  }, [key, ready, value]);

  return [value, setValue, ready] as const;
}
