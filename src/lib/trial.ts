const KEY_EMAIL = "recipify_email";
const KEY_SCANS = "recipify_trial_scans";
const KEY_STARTED = "recipify_trial_started";
const KEY_ENDED = "recipify_trial_ended";

/** Fridge-scan / trial paywall bypass (case-insensitive). */
const SCAN_LIMIT_BYPASS_EMAIL = "priyankasiwach214@gmail.com";

function isDevEnvironment(): boolean {
  try {
    if (import.meta.env?.DEV === true) return true;
    if (import.meta.env?.MODE === "development") return true;
  } catch {
    /* ignore */
  }
  try {
    if (typeof process !== "undefined" && process.env?.NODE_ENV === "development") return true;
  } catch {
    /* ignore */
  }
  return false;
}

/**
 * When true: do not enforce the 3-scan trial, do not lock recipes for trial, do not consume scans.
 * Active in Vite dev, when `NODE_ENV === 'development'`, or for {@link SCAN_LIMIT_BYPASS_EMAIL}.
 */
export function isTrialScanBypassActive(sessionEmail?: string | null): boolean {
  if (isDevEnvironment()) return true;
  const fromSession = sessionEmail?.trim().toLowerCase() ?? "";
  const fromLs = getStoredEmail()?.trim().toLowerCase() ?? "";
  const email = fromSession || fromLs;
  return email === SCAN_LIMIT_BYPASS_EMAIL.toLowerCase();
}

export function getStoredEmail(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(KEY_EMAIL);
  } catch {
    return null;
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
  if (isTrialScanBypassActive()) return false;
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
  if (isTrialScanBypassActive()) return getTrialScansRemaining();
  const before = getTrialScansRemaining();
  const next = Math.max(0, before - 1);
  setTrialScansRemaining(next);
  return next;
}

/** If trial scans hit zero but flag wasn’t set (e.g. refresh), lock the paywall. */
export function migrateTrialState(): void {
  if (typeof window === "undefined") return;
  if (isTrialScanBypassActive()) return;
  if (!getStoredEmail()) return;
  if (getTrialScansRemaining() > 0) return;
  if (!getTrialEnded()) {
    setTrialEnded(true);
  }
}
