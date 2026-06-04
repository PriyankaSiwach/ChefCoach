import { StrictMode, Component, type ReactNode, type ErrorInfo } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import "./index.css";

// ─── Global error boundary ───────────────────────────────────────────────────
// Catches any render-time crash and shows it instead of a blank white screen.
type EBState = { error: Error | null };
class GlobalErrorBoundary extends Component<{ children: ReactNode }, EBState> {
  state: EBState = { error: null };

  static getDerivedStateFromError(e: Error): EBState {
    return { error: e };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[GlobalErrorBoundary]", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (error) {
      return (
        <div
          style={{
            minHeight: "100dvh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "32px",
            fontFamily: "DM Sans, sans-serif",
            background: "#f9f6f0",
            color: "#1a1a1a",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 40 }}>⚠️</div>
          <h1 style={{ marginTop: 16, fontSize: 22, fontWeight: 700 }}>
            Something went wrong
          </h1>
          <p style={{ marginTop: 8, color: "#666", maxWidth: 480 }}>
            {error.message}
          </p>
          <pre
            style={{
              marginTop: 16,
              padding: "12px 16px",
              background: "#fff",
              border: "1px solid #e5e5e5",
              borderRadius: 12,
              fontSize: 12,
              textAlign: "left",
              maxWidth: "min(100%, 600px)",
              overflowX: "auto",
              whiteSpace: "pre-wrap",
              color: "#c0392b",
            }}
          >
            {error.stack}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: 20,
              padding: "10px 24px",
              borderRadius: 24,
              border: "none",
              background: "#2D5016",
              color: "#fff",
              fontWeight: 600,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Surface module-load failures that happen before React mounts
window.addEventListener("error", (event) => {
  const root = document.getElementById("root");
  if (!root || root.childElementCount > 0) return;
  root.innerHTML = `<div style="min-height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px;font-family:DM Sans,sans-serif;background:#faf7f2;text-align:center"><p style="font-size:22px;font-weight:700;color:#2D5016">Failed to load app</p><p style="margin-top:8px;color:#666;max-width:480px">${event.message}</p><button onclick="location.reload()" style="margin-top:20px;padding:10px 24px;border-radius:24px;border:none;background:#2D5016;color:#fff;font-weight:600;cursor:pointer">Reload</button></div>`;
});

// ─── Mount ───────────────────────────────────────────────────────────────────
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <GlobalErrorBoundary>
      <HashRouter>
        <App />
      </HashRouter>
    </GlobalErrorBoundary>
  </StrictMode>
);
