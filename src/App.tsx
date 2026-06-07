import { Routes, Route } from "react-router-dom";
import { ToastProvider } from "@/components/Toast";
import { RecipifyApp } from "@/components/RecipifyApp";
import { SuccessPage } from "@/pages/SuccessPage";
import { LoginPage } from "@/pages/LoginPage";
import { ResetPasswordPage } from "@/pages/ResetPasswordPage";
import { PrivacyPolicyPage } from "@/pages/PrivacyPolicyPage";
import { TermsOfServicePage } from "@/pages/TermsOfServicePage";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { SplashScreen } from "@/components/SplashScreen";
import { useAppSplash } from "@/hooks/useAppSplash";

function AppRoutes() {
  const { initializing } = useAuth();
  const splash = useAppSplash(initializing);

  return (
    <>
      <ToastProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/privacy" element={<PrivacyPolicyPage />} />
          <Route path="/terms" element={<TermsOfServicePage />} />

          <Route element={<ProtectedRoute />}>
            <Route path="/success" element={<SuccessPage />} />
            <Route path="/*" element={<RecipifyApp />} />
          </Route>
        </Routes>
      </ToastProvider>

      {splash.show ? (
        <SplashScreen exiting={splash.exiting} onExited={splash.onExited} />
      ) : null}
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
