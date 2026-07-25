import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

export function ProtectedRoute() {
  const { session, initializing, isGuest } = useAuth();
  const location = useLocation();

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

  // Allow through if the user has a real session OR is browsing as a guest
  if (!session && !isGuest) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
