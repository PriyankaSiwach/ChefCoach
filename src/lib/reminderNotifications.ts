/**
 * Local reminders for meals, water, and streaks.
 * Native iOS/Android: @capacitor/local-notifications
 * Web: Browser Notification API (when permitted)
 */

import { Capacitor } from "@capacitor/core";
import {
  dayHasMealLog,
  formatLocalDate,
  getStreakDisplay,
} from "@/lib/gamification";
import { pickReminderMessage } from "@/lib/reminderMessages";

export const REMINDERS_ENABLED_KEY = "chefcoach_reminders_enabled";

/** Fixed notification IDs — cancel/reschedule by ID. */
const ID = {
  mealBreakfast: 1001,
  mealLunch: 1002,
  mealDinner: 1003,
  waterMidday: 2001,
  waterAfternoon: 2002,
  waterEvening: 2003,
  streakProtect: 3001,
  streakStart: 3002,
} as const;

const ALL_IDS = Object.values(ID);

const APP_TITLE = "ChefCoach";

function waterStorageKey(dateStr: string): string {
  return `recipify_water_${dateStr}`;
}

export function readWaterGlassCount(dateStr: string = formatLocalDate(new Date())): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(waterStorageKey(dateStr));
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as boolean[];
    if (!Array.isArray(parsed)) return 0;
    return parsed.filter(Boolean).length;
  } catch {
    return 0;
  }
}

export function areRemindersEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(REMINDERS_ENABLED_KEY) === "1";
  } catch {
    return false;
  }
}

export function setRemindersEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(REMINDERS_ENABLED_KEY, enabled ? "1" : "0");
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent("chefcoach-reminders-changed"));
}

function atToday(hour: number, minute: number): Date {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d;
}

function isFutureToday(schedule: Date): boolean {
  return schedule.getTime() > Date.now() + 30_000;
}

type PendingNotification = {
  id: number;
  kind: "meal" | "water" | "streak_active" | "streak_start";
  at: Date;
  streakCount?: number;
};

function buildPendingForToday(): PendingNotification[] {
  const today = formatLocalDate(new Date());
  const hasMeal = dayHasMealLog(today);
  const waterGlasses = readWaterGlassCount(today);
  const streak = getStreakDisplay();
  const pending: PendingNotification[] = [];

  if (!hasMeal) {
    const mealSlots: Array<{ id: number; hour: number; minute: number }> = [
      { id: ID.mealBreakfast, hour: 9, minute: 0 },
      { id: ID.mealLunch, hour: 12, minute: 30 },
      { id: ID.mealDinner, hour: 19, minute: 0 },
    ];
    for (const slot of mealSlots) {
      const at = atToday(slot.hour, slot.minute);
      if (isFutureToday(at)) {
        pending.push({ id: slot.id, kind: "meal", at });
      }
    }
  }

  if (waterGlasses < 8) {
    const waterSlots: Array<{ id: number; hour: number; minute: number; minGlasses: number }> = [
      { id: ID.waterMidday, hour: 14, minute: 0, minGlasses: 4 },
      { id: ID.waterAfternoon, hour: 17, minute: 0, minGlasses: 6 },
      { id: ID.waterEvening, hour: 20, minute: 0, minGlasses: 8 },
    ];
    for (const slot of waterSlots) {
      if (waterGlasses >= slot.minGlasses) continue;
      const at = atToday(slot.hour, slot.minute);
      if (isFutureToday(at)) {
        pending.push({ id: slot.id, kind: "water", at });
      }
    }
  }

  if (!hasMeal) {
    if (streak.count >= 1) {
      const at = atToday(20, 30);
      if (isFutureToday(at)) {
        pending.push({
          id: ID.streakProtect,
          kind: "streak_active",
          at,
          streakCount: streak.count,
        });
      }
    } else {
      const at = atToday(18, 0);
      if (isFutureToday(at)) {
        pending.push({ id: ID.streakStart, kind: "streak_start", at });
      }
    }
  }

  return pending;
}

async function cancelAllScheduled(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      const { LocalNotifications } = await import("@capacitor/local-notifications");
      await LocalNotifications.cancel({ notifications: ALL_IDS.map((id) => ({ id })) });
    } catch {
      /* plugin unavailable */
    }
    return;
  }

  for (const id of ALL_IDS) {
    const handle = webTimerHandles.get(id);
    if (handle != null) {
      window.clearTimeout(handle);
      webTimerHandles.delete(id);
    }
  }
}

const webTimerHandles = new Map<number, number>();

async function scheduleNative(notifications: PendingNotification[]): Promise<void> {
  const { LocalNotifications } = await import("@capacitor/local-notifications");
  await LocalNotifications.schedule({
    notifications: notifications.map((n) => ({
      id: n.id,
      title: APP_TITLE,
      body: pickReminderMessage(n.kind, n.streakCount),
      schedule: { at: n.at },
      sound: undefined,
      smallIcon: undefined,
      iconColor: "#2D5016",
    })),
  });
}

function scheduleWeb(notifications: PendingNotification[]): void {
  for (const n of notifications) {
    const delay = n.at.getTime() - Date.now();
    if (delay <= 0) continue;

    const existing = webTimerHandles.get(n.id);
    if (existing != null) window.clearTimeout(existing);

    const handle = window.setTimeout(() => {
      webTimerHandles.delete(n.id);
      const today = formatLocalDate(new Date());
      const stillRelevant =
        n.kind === "water"
          ? readWaterGlassCount(today) < 8
          : !dayHasMealLog(today);
      if (!stillRelevant || !areRemindersEnabled()) return;

      const body = pickReminderMessage(n.kind, n.streakCount);
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification(APP_TITLE, { body, tag: `chefcoach-${n.id}` });
      }
    }, delay);

    webTimerHandles.set(n.id, handle);
  }
}

export async function requestReminderPermission(): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    try {
      const { LocalNotifications } = await import("@capacitor/local-notifications");
      const { display } = await LocalNotifications.requestPermissions();
      return display === "granted";
    } catch {
      return false;
    }
  }

  if (typeof Notification === "undefined") return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

/** Register for APNs remote notifications (iOS). Safe no-op if plugin unavailable. */
export async function registerForRemoteNotifications(): Promise<void> {
  if (Capacitor.getPlatform() !== "ios" || !Capacitor.isNativePlatform()) return;
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    await PushNotifications.register();
  } catch (err) {
    console.warn("[reminders] remote registration failed:", err);
  }
}

/** Rebuild today’s reminder schedule from current meal / water / streak state. */
export async function syncReminderSchedule(): Promise<void> {
  await cancelAllScheduled();
  if (!areRemindersEnabled()) return;

  const pending = buildPendingForToday();
  if (pending.length === 0) return;

  if (Capacitor.isNativePlatform()) {
    try {
      await scheduleNative(pending);
    } catch (err) {
      console.warn("[reminders] schedule failed", err);
    }
  } else {
    scheduleWeb(pending);
  }
}

export async function enableReminders(): Promise<{ ok: boolean; reason?: string }> {
  const granted = await requestReminderPermission();
  if (!granted) {
    return {
      ok: false,
      reason: "Notification permission was denied. Enable in Settings to get reminders.",
    };
  }
  setRemindersEnabled(true);
  await syncReminderSchedule();
  await registerForRemoteNotifications();
  return { ok: true };
}

export async function disableReminders(): Promise<void> {
  setRemindersEnabled(false);
  await cancelAllScheduled();
}

export async function toggleReminders(
  enabled: boolean
): Promise<{ ok: boolean; reason?: string }> {
  if (enabled) return enableReminders();
  await disableReminders();
  return { ok: true };
}

/** Call on app launch and when user logs meals or water. */
export function initReminderSync(): () => void {
  if (typeof window === "undefined") return () => {};

  const sync = () => {
    if (areRemindersEnabled()) void syncReminderSchedule();
  };

  sync();

  const onVisibility = () => {
    if (document.visibilityState === "visible") sync();
  };

  window.addEventListener("meal-logged", sync);
  window.addEventListener("recipify-stats-changed", sync);
  window.addEventListener("recipify-water-changed", sync);
  window.addEventListener("chefcoach-reminders-changed", sync);
  document.addEventListener("visibilitychange", onVisibility);

  return () => {
    window.removeEventListener("meal-logged", sync);
    window.removeEventListener("recipify-stats-changed", sync);
    window.removeEventListener("recipify-water-changed", sync);
    window.removeEventListener("chefcoach-reminders-changed", sync);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}
