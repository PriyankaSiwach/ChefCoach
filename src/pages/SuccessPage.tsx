import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

export function SuccessPage() {
  const navigate = useNavigate();
  const [count, setCount] = useState(3);

  useEffect(() => {
    localStorage.setItem("recipify_is_pro", "true");
    localStorage.setItem("recipify_trial_active", "true");
    localStorage.setItem("recipify_trial_started", new Date().toISOString());
    localStorage.setItem("recipify_total_scans", "0");

    const countdown = setInterval(() => {
      setCount((c) => {
        if (c <= 1) {
          clearInterval(countdown);
          navigate("/", { replace: true });
        }
        return c - 1;
      });
    }, 1000);

    return () => clearInterval(countdown);
  }, [navigate]);

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "linear-gradient(135deg, #2D5016, #4A7C28)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        color: "white",
        textAlign: "center",
        padding: "32px",
        paddingTop: "max(32px, env(safe-area-inset-top))",
        paddingBottom: "max(32px, env(safe-area-inset-bottom))",
        fontFamily: "DM Sans, sans-serif",
      }}
    >
      <div style={{ fontSize: "clamp(48px, 12vw, 72px)", marginBottom: "24px" }}>🎉</div>
      <h1
        style={{
          fontFamily: "Playfair Display, serif",
          fontSize: "clamp(24px, 6vw, 32px)",
          marginBottom: "16px",
          lineHeight: 1.2,
        }}
      >
        Welcome to Recipify Pro!
      </h1>
      <div
        style={{
          background: "rgba(255,255,255,0.15)",
          borderRadius: "16px",
          padding: "20px 32px",
          marginBottom: "24px",
          maxWidth: "min(100%, 400px)",
        }}
      >
        <p style={{ fontSize: "16px", marginBottom: "8px", opacity: 0.9 }}>
          ✓ 3-day free trial started
        </p>
        <p style={{ fontSize: "16px", marginBottom: "8px", opacity: 0.9 }}>
          ✓ Unlimited scans unlocked
        </p>
        <p style={{ fontSize: "16px", opacity: 0.9 }}>✓ Full macro tracking active</p>
      </div>
      <p style={{ fontSize: "14px", opacity: 0.7, marginBottom: "8px" }}>
        No charge for 3 days. Cancel anytime.
      </p>
      <p style={{ fontSize: "13px", opacity: 0.5 }}>Redirecting in {count}...</p>
    </div>
  );
}
