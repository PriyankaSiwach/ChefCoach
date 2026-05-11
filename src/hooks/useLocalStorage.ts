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
      } else if (key === RECIPIFY_PROFILE_STORAGE_KEY) {
        setValue(null as T);
      }
    } catch {
      // ignore read errors
    } finally {
      setReady(true);
    }
  }, [key]);

  useEffect(() => {
    if (key !== RECIPIFY_PROFILE_STORAGE_KEY) return;
    const onRemote = () => {
      try {
        migrateLegacyProfileStorage();
        const raw = window.localStorage.getItem(key);
        if (raw !== null) {
          let parsed = JSON.parse(raw) as T;
          const n = normalizeUserProfile(parsed as unknown);
          if (n) parsed = n as T;
          setValue(parsed);
        } else {
          setValue(null as T);
        }
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("recipify-profile-sync", onRemote);
    return () => window.removeEventListener("recipify-profile-sync", onRemote);
  }, [key]);

  useEffect(() => {
    if (!ready) return;
    try {
      if (key === RECIPIFY_PROFILE_STORAGE_KEY && value === null) {
        window.localStorage.removeItem(key);
        return;
      }
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // ignore write errors
    }
  }, [key, ready, value]);

  return [value, setValue, ready] as const;
}
