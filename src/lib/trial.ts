const KEY_EMAIL = "recipify_email";
const KEY_SCANS = "recipify_trial_scans";
const KEY_STARTED = "recipify_trial_started";
const KEY_ENDED = "recipify_trial_ended";

export function getStoredEmail(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(KEY_EMAIL);
  } catch {
    return null;
  }
}

export function saveEmailGateSubmission(email: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY_EMAIL, email.trim());
    window.localStorage.setItem(KEY_SCANS, "3");
    window.localStorage.setItem(KEY_STARTED, new Date().toISOString());
    window.localStorage.removeItem(KEY_ENDED);
  } catch {
    /* ignore */
  }
}

export function getTrialScansRemaining(): number {
  if (typeof window === "undefined") return 3;
  try {
    const raw = window.localStorage.getItem(KEY_SCANS);
    if (raw === null) {
      return getStoredEmail() ? 3 : 0;
    }
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  } catch {
    return 3;
  }
}

export function setTrialScansRemaining(n: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY_SCANS, String(Math.max(0, n)));
  } catch {
    /* ignore */
  }
}

export function getTrialEnded(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(KEY_ENDED) === "true";
  } catch {
    return false;
  }
}

export function setTrialEnded(value: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (value) window.localStorage.setItem(KEY_ENDED, "true");
    else window.localStorage.removeItem(KEY_ENDED);
  } catch {
    /* ignore */
  }
}

/** After a successful recipe generation: decrement scans. Returns new remaining count. */
export function consumeTrialScan(): number {
  const before = getTrialScansRemaining();
  const next = Math.max(0, before - 1);
  setTrialScansRemaining(next);
  return next;
}

/** If trial scans hit zero but flag wasn’t set (e.g. refresh), lock the paywall. */
export function migrateTrialState(): void {
  if (typeof window === "undefined") return;
  if (!getStoredEmail()) return;
  if (getTrialScansRemaining() > 0) return;
  if (!getTrialEnded()) {
    setTrialEnded(true);
  }
}
