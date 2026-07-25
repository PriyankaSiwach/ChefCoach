/**
 * One-time iOS notification permission prompt after first login/signup.
 * Flag persists on device (localStorage — same persistence as other chefcoach_* keys).
 */
import { Capacitor } from "@capacitor/core";
import {
  registerForRemoteNotifications,
  requestReminderPermission,
  setRemindersEnabled,
  syncReminderSchedule,
} from "@/lib/reminderNotifications";

/** Device flag — do not prompt again once set (UserDefaults-equivalent on device). */
export const HAS_ASKED_NOTIFICATION_PERMISSION_KEY =
  "chefcoach_has_asked_notification_permission";

export function hasAskedNotificationPermission(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(HAS_ASKED_NOTIFICATION_PERMISSION_KEY) === "1";
  } catch {
    return true;
  }
}

export function markAskedNotificationPermission(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(HAS_ASKED_NOTIFICATION_PERMISSION_KEY, "1");
  } catch {
    /* ignore */
  }
}

const PROMPT_DELAY_MS = 700;

/**
 * Show Apple's notification permission dialog once after first successful sign-in.
 * Call only from SIGNED_IN — not on app launch session restore or before login.
 */
export async function maybePromptNotificationPermissionAfterLogin(): Promise<void> {
  if (typeof window === "undefined") return;
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "ios") return;
  if (hasAskedNotificationPermission()) return;

  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, PROMPT_DELAY_MS);
  });

  if (hasAskedNotificationPermission()) return;

  const granted = await requestReminderPermission();
  markAskedNotificationPermission();

  if (granted) {
    setRemindersEnabled(true);
    await syncReminderSchedule();
    await registerForRemoteNotifications();
  } else {
    setRemindersEnabled(false);
  }
}
