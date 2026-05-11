import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

export function ProtectedRoute() {
  const { session, initializing } = useAuth();
  const location = useLocation();

  if (initializing) {
    return <div className="min-h-screen bg-[var(--cream)]" aria-busy />;
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
