import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";

/**
 * Linked from Supabase password recovery email (`redirectTo`).
 * `detectSessionInUrl` restores the recovery session from the URL hash.
 */
export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const check = () => {
      void supabase.auth.getSession().then(({ data }) => {
        if (!cancelled && data.session) setReady(true);
      });
    };
    check();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!cancelled && session) setReady(true);
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const submit = async () => {
    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) {
        setError(err.message);
        return;
      }
      navigate("/login", { replace: true });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="page-safe min-h-screen bg-[var(--cream)]">
      <section className="mx-auto mt-10 w-full max-w-[430px] rounded-3xl border border-[var(--border)] bg-[var(--white)] p-6 shadow-sm">
        <h1 className="font-playfair text-2xl text-[var(--green)]">Set a new password</h1>
        <p className="mt-2 text-sm text-[var(--gray)]">
          {!ready
            ? "Open the link from your reset email in this browser, or request a new reset from the login page."
            : "Choose a new password for your account."}
        </p>
        {ready ? (
          <div className="mt-5 space-y-3">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
              placeholder="New password"
              autoComplete="new-password"
            />
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
              placeholder="Confirm new password"
              autoComplete="new-password"
            />
            {error ? <p className="text-xs text-red-600">{error}</p> : null}
            <button
              type="button"
              disabled={submitting}
              onClick={() => void submit()}
              className="w-full rounded-full bg-[var(--green)] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
            >
              {submitting ? "Saving…" : "Update password"}
            </button>
          </div>
        ) : null}
        <button
          type="button"
          className="mt-6 w-full text-center text-sm text-[var(--gray)] underline underline-offset-2"
          onClick={() => navigate("/login")}
        >
          Back to login
        </button>
      </section>
    </main>
  );
}
