import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/components/Toast";
import { checkEmailRegistered, resolveLoginFailureKind } from "@/lib/authEmailCheck";
import {
  ACCOUNT_EXISTS_MESSAGE,
  isAccountExistsAuthError,
  loginErrorMessage,
  signupErrorMessage,
  SIGNUP_SUCCESS_HINT,
} from "@/lib/authErrors";

const MAX_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 60;
const LAST_EMAIL_KEY = "recipify_last_login_email";
const BIOMETRIC_KEY = "recipify_biometric_eligible";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isEmailValid(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

function getRedirectBase() {
  return `${window.location.origin}${window.location.pathname || "/"}`.replace(/\/$/, "");
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function AppleLogo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden width={20} height={20} fill="currentColor">
      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zm-5.02-13.03c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
  );
}

function GoogleLogo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden width={20} height={20}>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={18} height={18} aria-hidden>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={18} height={18} aria-hidden>
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

function FaceIdIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} width={36} height={36} aria-hidden>
      <rect x="2" y="2" width="5" height="5" rx="1.5" />
      <rect x="17" y="2" width="5" height="5" rx="1.5" />
      <rect x="2" y="17" width="5" height="5" rx="1.5" />
      <rect x="17" y="17" width="5" height="5" rx="1.5" />
      <line x1="9" y1="8.5" x2="9" y2="11" />
      <line x1="15" y1="8.5" x2="15" y2="11" />
      <path d="M9 15.5c.75 1 1.5 1.5 3 1.5s2.25-.5 3-1.5" />
      <line x1="12" y1="8.5" x2="12" y2="14" />
    </svg>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function LoginPage() {
  const navigate = useNavigate();
  const showToast = useToast();
  const { session, initializing, signIn, signUp } = useAuth();

  // Form mode
  const [mode, setMode] = useState<"login" | "signup">("login");

  // Fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Validation — only surface after user has touched / attempted submit
  const [emailTouched, setEmailTouched] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  // Status
  const [formError, setFormError] = useState<string | null>(null);
  const [showAccountExistsActions, setShowAccountExistsActions] = useState(false);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [shaking, setShaking] = useState(false);

  // Social loading
  const [appleLoading, setAppleLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  // Forgot password
  const [resetSending, setResetSending] = useState(false);

  // Rate limiting
  const [failCount, setFailCount] = useState(0);
  const [lockoutSecondsLeft, setLockoutSecondsLeft] = useState(0);
  const lockoutRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Biometric
  const [showBiometric, setShowBiometric] = useState(false);
  const [bioLoading, setBioLoading] = useState(false);
  const savedEmail = useRef<string | null>(null);

  // Refs for keyboard navigation
  const passwordRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLDivElement>(null);

  // ── Redirect if already authed ──────────────────────────────────────────────
  useEffect(() => {
    if (initializing) return;
    if (session) navigate("/", { replace: true });
  }, [session, initializing, navigate]);

  // ── Biometric eligibility check ─────────────────────────────────────────────
  useEffect(() => {
    if (initializing || session) return;
    const eligible = window.localStorage.getItem(BIOMETRIC_KEY) === "true";
    const lastEmail = window.localStorage.getItem(LAST_EMAIL_KEY) ?? "";
    if (eligible && lastEmail && Capacitor.isNativePlatform()) {
      savedEmail.current = lastEmail;
      setEmail(lastEmail);
      setShowBiometric(true);
    }
  }, [initializing, session]);

  // ── Lockout countdown ───────────────────────────────────────────────────────
  const startLockout = useCallback(() => {
    setLockoutSecondsLeft(LOCKOUT_SECONDS);
    lockoutRef.current = setInterval(() => {
      setLockoutSecondsLeft((s) => {
        if (s <= 1) {
          if (lockoutRef.current) clearInterval(lockoutRef.current);
          setFailCount(0);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => () => {
    if (lockoutRef.current) clearInterval(lockoutRef.current);
  }, []);

  // ── Shake helper ─────────────────────────────────────────────────────────────
  const triggerShake = () => {
    setShaking(true);
    setTimeout(() => setShaking(false), 520);
  };

  // ── Email blur validation ────────────────────────────────────────────────────
  const validateEmail = (val: string) => {
    if (!val.trim()) return setEmailError("Email is required.");
    if (!isEmailValid(val)) return setEmailError("Enter a valid email address.");
    setEmailError(null);
  };

  // ── Biometric auth ───────────────────────────────────────────────────────────
  const triggerBiometric = async () => {
    // Biometric plugin not installed yet — fall back to password login
    setShowBiometric(false);
  };

  // ── Social OAuth ─────────────────────────────────────────────────────────────
  const signInWithOAuth = async (provider: "apple" | "google") => {
    provider === "apple" ? setAppleLoading(true) : setGoogleLoading(true);
    setFormError(null);
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: `${getRedirectBase()}/#/login` },
      });
      if (error) { setFormError(error.message); return; }
      if (data?.url) window.location.assign(data.url);
      else setFormError(`Could not start ${provider === "apple" ? "Apple" : "Google"} sign-in.`);
    } finally {
      provider === "apple" ? setAppleLoading(false) : setGoogleLoading(false);
    }
  };

  // ── Password reset ───────────────────────────────────────────────────────────
  const sendPasswordReset = async () => {
    const addr = email.trim();
    if (!addr || !isEmailValid(addr)) {
      setFormError("Enter your email address above first.");
      return;
    }
    setFormError(null);
    setResetSending(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(addr, {
        redirectTo: `${getRedirectBase()}/#/reset-password`,
      });
      if (error) { setFormError(error.message); return; }
      showToast("Reset link sent — check your email.", "success");
    } finally {
      setResetSending(false);
    }
  };

  // ── Main submit ──────────────────────────────────────────────────────────────
  const submit = async () => {
    // Field validation
    if (!email.trim()) { setEmailError("Email is required."); triggerShake(); return; }
    if (!isEmailValid(email)) { setEmailError("Enter a valid email address."); triggerShake(); return; }
    if (!password.trim()) { setFormError("Password is required."); triggerShake(); return; }
    if (lockoutSecondsLeft > 0) return;

    setFormError(null);
    setShowAccountExistsActions(false);
    setInfoMsg(null);
    setSubmitting(true);

    try {
      if (mode === "login") {
        const registered = await checkEmailRegistered(email);
        if (registered === false) {
          setFormError(loginErrorMessage("account_not_found"));
          triggerShake();
          const next = failCount + 1;
          setFailCount(next);
          if (next >= MAX_ATTEMPTS) startLockout();
          return;
        }

        const { error, code } = await signIn(email, password);
        if (error) {
          const kind = await resolveLoginFailureKind(error, code, email, registered);
          setFormError(loginErrorMessage(kind));
          triggerShake();
          const next = failCount + 1;
          setFailCount(next);
          if (next >= MAX_ATTEMPTS) startLockout();
          return;
        }
        // Success
        window.localStorage.setItem(LAST_EMAIL_KEY, email.trim().toLowerCase());
        window.localStorage.setItem(BIOMETRIC_KEY, "true");
        navigate("/", { replace: true });
      } else {
        if (password.length < 8) {
          setFormError("Password must be at least 8 characters.");
          triggerShake();
          return;
        }
        const { error, needsEmailConfirm, accountExists, code } = await signUp(email, password);
        if (accountExists) {
          setFormError(ACCOUNT_EXISTS_MESSAGE);
          setShowAccountExistsActions(true);
          triggerShake();
          return;
        }
        if (error) {
          if (isAccountExistsAuthError({ message: error, code: code ?? undefined })) {
            setFormError(ACCOUNT_EXISTS_MESSAGE);
            setShowAccountExistsActions(true);
          } else {
            setFormError(signupErrorMessage(error, code));
          }
          triggerShake();
          return;
        }
        if (needsEmailConfirm) {
          showToast(SIGNUP_SUCCESS_HINT, "success");
          setPassword("");
          setFormError(null);
          setShowAccountExistsActions(false);
          setMode("login");
          setInfoMsg("Use the Log in tab with your new email and password.");
          return;
        }
        navigate("/", { replace: true });
      }
    } finally {
      setSubmitting(false);
    }
  };

  // ── Loading gate ─────────────────────────────────────────────────────────────
  if (initializing) {
    return (
      <div
        className="flex min-h-screen flex-col items-center justify-center bg-[var(--cream)] text-sm text-[var(--gray)]"
        aria-busy
        aria-label="Loading"
      >
        <span className="app-loading-spinner mb-3" aria-hidden />
        Loading…
      </div>
    );
  }

  const locked = lockoutSecondsLeft > 0;
  const emailInvalid = emailTouched && !!emailError;

  // ── Biometric screen ─────────────────────────────────────────────────────────
  if (showBiometric) {
    return (
      <main className="min-h-screen bg-[var(--cream)] flex items-center justify-center px-6 py-8">
        <section className="w-full max-w-[430px] rounded-3xl border border-[var(--border)] bg-[var(--white)] p-8 shadow-sm text-center">
          <div className="flex justify-center text-[var(--green)]">
            <FaceIdIcon />
          </div>
          <h1 className="mt-4 font-playfair text-2xl text-[var(--green)]">Welcome back</h1>
          <p className="mt-2 text-sm text-[var(--gray)]">
            Use Face ID or Touch ID to log in as{" "}
            <span className="font-medium text-[var(--text)]">{savedEmail.current}</span>
          </p>
          <button
            type="button"
            aria-label="Authenticate with Face ID or Touch ID"
            disabled={bioLoading}
            onClick={() => void triggerBiometric()}
            className="mt-6 w-full rounded-full bg-[var(--green)] py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            {bioLoading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="login-spinner" aria-hidden /> Authenticating…
              </span>
            ) : "Use Face ID / Touch ID"}
          </button>
          <button
            type="button"
            aria-label="Sign in with email and password instead"
            className="mt-3 text-sm text-[var(--gray)] underline underline-offset-2"
            onClick={() => setShowBiometric(false)}
          >
            Sign in with password instead
          </button>
        </section>
      </main>
    );
  }

  // ── Main login/signup form ───────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-[var(--cream)] px-6 py-8">
      <section className="mx-auto mt-10 w-full max-w-[430px] rounded-3xl border border-[var(--border)] bg-[var(--white)] p-6 shadow-sm">
        <h1 className="font-playfair text-3xl text-[var(--green)]">
          {mode === "login" ? "Welcome back" : "Create your account"}
        </h1>
        <p className="mt-1 text-sm text-[var(--gray)]">
          {mode === "login"
            ? "Log in to access your personalized dashboard."
            : "Sign up to save your profile and progress."
          }
        </p>

        {/* Mode toggle */}
        <div
          role="tablist"
          aria-label="Authentication mode"
          className="mt-5 flex rounded-full bg-[var(--gray-light)] p-1 text-xs"
        >
          <button
            role="tab"
            aria-selected={mode === "login"}
            type="button"
            onClick={() => {
              setMode("login");
              setFormError(null);
              setShowAccountExistsActions(false);
              setInfoMsg(null);
              setEmailError(null);
              setEmailTouched(false);
            }}
            className={`flex-1 rounded-full py-2 transition ${
              mode === "login" ? "bg-[var(--green)] text-white" : "text-[var(--gray)]"
            }`}
          >
            Log in
          </button>
          <button
            role="tab"
            aria-selected={mode === "signup"}
            type="button"
            onClick={() => {
              setMode("signup");
              setFormError(null);
              setShowAccountExistsActions(false);
              setInfoMsg(null);
              setEmailError(null);
              setEmailTouched(false);
            }}
            className={`flex-1 rounded-full py-2 transition ${
              mode === "signup" ? "bg-[var(--green)] text-white" : "text-[var(--gray)]"
            }`}
          >
            Sign up
          </button>
        </div>

        {/* Social sign-in — Apple must be at least as prominent as Google (Apple guideline 4.8) */}
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            aria-label="Sign in with Apple"
            disabled={appleLoading || googleLoading}
            onClick={() => void signInWithOAuth("apple")}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-black py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-neutral-900 disabled:opacity-50"
          >
            <AppleLogo />
            {appleLoading ? "…" : "Apple"}
          </button>
          <button
            type="button"
            aria-label="Sign in with Google"
            disabled={appleLoading || googleLoading}
            onClick={() => void signInWithOAuth("google")}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--white)] py-3 text-sm font-semibold text-[var(--text)] shadow-sm transition hover:bg-[var(--gray-light)] disabled:opacity-50"
          >
            <GoogleLogo />
            {googleLoading ? "…" : "Google"}
          </button>
        </div>

        <div className="relative my-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-[var(--border)]" aria-hidden />
          <span className="text-[11px] uppercase tracking-wide text-[var(--gray)]">or email</span>
          <div className="h-px flex-1 bg-[var(--border)]" aria-hidden />
        </div>

        {/* Email + password form */}
        <div
          ref={formRef}
          className={shaking ? "login-form-shake" : ""}
        >
          {/* Email */}
          <div>
            <label htmlFor="login-email" className="sr-only">Email address</label>
            <input
              id="login-email"
              aria-label="Email address"
              aria-describedby={emailInvalid ? "email-error" : undefined}
              aria-invalid={emailInvalid}
              type="email"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (emailTouched) validateEmail(e.target.value);
              }}
              onBlur={() => { setEmailTouched(true); validateEmail(email); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); passwordRef.current?.focus(); } }}
              className={`w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition focus:ring-2 focus:ring-[var(--green)]/30 ${
                emailInvalid
                  ? "border-red-400 bg-red-50 focus:border-red-400"
                  : "border-[var(--border)] focus:border-[var(--green)]"
              }`}
              placeholder="you@example.com"
              autoComplete="email"
            />
            {emailInvalid ? (
              <p id="email-error" role="alert" className="mt-1.5 text-xs text-red-600">
                {emailError}
              </p>
            ) : null}
          </div>

          {/* Password */}
          <div className="mt-3">
            <label htmlFor="login-password" className="sr-only">Password</label>
            <div className="relative">
              <input
                id="login-password"
                ref={passwordRef}
                aria-label="Password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void submit(); } }}
                className="w-full rounded-xl border border-[var(--border)] px-3 py-2.5 pr-10 text-sm outline-none transition focus:border-[var(--green)] focus:ring-2 focus:ring-[var(--green)]/30"
                placeholder="••••••••"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
              />
              <button
                type="button"
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--gray)] hover:text-[var(--text)]"
                tabIndex={0}
              >
                <EyeIcon open={showPassword} />
              </button>
            </div>
          </div>

          {/* Forgot password — login, or after duplicate signup */}
          {mode === "login" || showAccountExistsActions ? (
            <div className={`mt-2 flex flex-wrap items-center justify-end gap-x-3 gap-y-1 ${showAccountExistsActions ? "justify-start" : ""}`}>
              {showAccountExistsActions ? (
                <button
                  type="button"
                  aria-label="Switch to log in"
                  className="text-xs font-medium text-[var(--green)] underline underline-offset-2 hover:text-[var(--text)]"
                  onClick={() => {
                    setMode("login");
                    setShowAccountExistsActions(false);
                    setFormError(null);
                  }}
                >
                  Log in instead
                </button>
              ) : null}
              <button
                type="button"
                aria-label="Send password reset email"
                disabled={resetSending}
                onClick={() => void sendPasswordReset()}
                className="text-xs font-medium text-[var(--green)] underline underline-offset-2 hover:text-[var(--text)] disabled:opacity-50"
              >
                {resetSending ? "Sending…" : "Forgot password?"}
              </button>
            </div>
          ) : null}

          {/* Lockout */}
          {locked ? (
            <div
              role="alert"
              className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900"
            >
              Too many failed attempts. Please wait{" "}
              <span className="font-semibold tabular-nums">{lockoutSecondsLeft}s</span> before
              trying again.
            </div>
          ) : null}

          {/* Generic form error */}
          {formError && !locked ? (
            <p role="alert" className="mt-3 text-xs text-red-600">
              {formError}
            </p>
          ) : null}

          {/* Info message */}
          {infoMsg ? (
            <p role="status" className="mt-3 text-xs text-[var(--green)]">
              {infoMsg}
            </p>
          ) : null}

          {/* Submit */}
          <button
            type="button"
            aria-label={mode === "login" ? "Log in to your account" : "Create your account"}
            disabled={submitting || locked}
            onClick={() => void submit()}
            className="mt-4 w-full rounded-full bg-[var(--green)] px-4 py-3 text-sm font-semibold text-white transition hover:brightness-105 disabled:opacity-60"
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <span className="login-spinner" aria-hidden />
                {mode === "login" ? "Logging in…" : "Creating account…"}
              </span>
            ) : (
              mode === "login" ? "Log in" : "Create account"
            )}
          </button>
        </div>

        {/* Legal */}
        <p className="mt-6 text-center text-[11px] leading-relaxed text-[var(--gray)]">
          By continuing you agree to our{" "}
          <Link
            to="/terms"
            aria-label="Terms of Service"
            className="font-medium text-[var(--green)] underline underline-offset-2 hover:text-[var(--text)]"
          >
            Terms of Service
          </Link>
          <span className="mx-1.5 text-[var(--border)]" aria-hidden>·</span>
          <Link
            to="/privacy"
            aria-label="Privacy Policy"
            className="font-medium text-[var(--green)] underline underline-offset-2 hover:text-[var(--text)]"
          >
            Privacy Policy
          </Link>
        </p>
      </section>
    </main>
  );
}
