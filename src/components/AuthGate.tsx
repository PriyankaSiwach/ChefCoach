
import { useState } from "react";

type Props = {
  onAuthenticated: () => void;
};

export function AuthGate({ onAuthenticated }: Props) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (!email.trim() || !password.trim()) {
      setError("Please enter both email and password.");
      return;
    }
    setError(null);
    onAuthenticated();
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
            : "Sign up to save your meal plan and progress."}
        </p>

        <div className="mt-5 flex rounded-full bg-[var(--gray-light)] p-1 text-xs">
          <button
            type="button"
            onClick={() => setMode("login")}
            className={`flex-1 rounded-full py-2 ${
              mode === "login" ? "bg-[var(--green)] text-white" : "text-[var(--gray)]"
            }`}
          >
            Log in
          </button>
          <button
            type="button"
            onClick={() => setMode("signup")}
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
          />
          <input
            aria-label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
            placeholder="••••••••"
          />
          {error ? <p className="text-xs text-red-600">{error}</p> : null}
          <button
            type="button"
            onClick={submit}
            className="w-full rounded-full bg-[var(--green)] px-4 py-2.5 text-sm font-medium text-white"
          >
            {mode === "login" ? "Continue to dashboard" : "Create account"}
          </button>
        </div>
      </section>
    </main>
  );
}
