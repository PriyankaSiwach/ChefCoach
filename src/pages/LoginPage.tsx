import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

export function LoginPage() {
  const navigate = useNavigate();
  const { session, initializing, signIn, signUp } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (initializing) return;
    if (session) navigate("/", { replace: true });
  }, [session, initializing, navigate]);

  if (initializing) {
    return <div className="min-h-screen bg-[var(--cream)]" aria-busy />;
  }

  const submit = async () => {
    if (!email.trim() || !password.trim()) {
      setError("Please enter both email and password.");
      return;
    }
    setError(null);
    setInfo(null);
    setSubmitting(true);
    try {
      if (mode === "login") {
        const { error: err } = await signIn(email, password);
        if (err) {
          setError(err);
          return;
        }
        navigate("/", { replace: true });
      } else {
        const { error: err, needsEmailConfirm } = await signUp(email, password);
        if (err) {
          setError(err);
          return;
        }
        if (needsEmailConfirm) {
          setInfo("Check your email to confirm your account, then log in.");
          setMode("login");
          return;
        }
        navigate("/", { replace: true });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-[var(--cream)] px-6 py-8">
      <section className="mx-auto mt-10 w-full max-w-[430px] rounded-3xl border border-[var(--border)] bg-[var(--white)] p-6 shadow-sm">
        <h1 className="font-playfair text-3xl text-[var(--green)]">
          {mode === "login" ? "Welcome back" : "Create your account"}
        </h1>
        <p className="mt-1 text-sm text-[var(--gray)]">
          {mode === "login"
            ? "Log in to access your personalized dashboard."
            : "Sign up with email and password to save your profile and progress."}
        </p>

        <div className="mt-5 flex rounded-full bg-[var(--gray-light)] p-1 text-xs">
          <button
            type="button"
            onClick={() => {
              setMode("login");
              setError(null);
              setInfo(null);
            }}
            className={`flex-1 rounded-full py-2 ${
              mode === "login" ? "bg-[var(--green)] text-white" : "text-[var(--gray)]"
            }`}
          >
            Log in
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("signup");
              setError(null);
              setInfo(null);
            }}
            className={`flex-1 rounded-full py-2 ${
              mode === "signup" ? "bg-[var(--green)] text-white" : "text-[var(--gray)]"
            }`}
          >
            Sign up
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <input
            aria-label="Email address"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
            placeholder="you@example.com"
            autoComplete="email"
          />
          <input
            aria-label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
            placeholder="••••••••"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />
          {error ? <p className="text-xs text-red-600">{error}</p> : null}
          {info ? <p className="text-xs text-[var(--green)]">{info}</p> : null}
          <button
            type="button"
            disabled={submitting}
            onClick={() => void submit()}
            className="w-full rounded-full bg-[var(--green)] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
          >
            {submitting ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}
          </button>
        </div>
      </section>
    </main>
  );
}
