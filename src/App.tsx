import { useEffect } from "react";
import { Routes, Route } from "react-router-dom";
import { ToastProvider } from "@/components/Toast";
import { RecipifyApp } from "@/components/RecipifyApp";
import { SuccessPage } from "@/pages/SuccessPage";
import { LoginPage } from "@/pages/LoginPage";
import { ResetPasswordPage } from "@/pages/ResetPasswordPage";
import { PrivacyPolicyPage } from "@/pages/PrivacyPolicyPage";
import { TermsOfServicePage } from "@/pages/TermsOfServicePage";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { initializeRevenueCatSdkOnLaunch } from "@/lib/revenueCat";

export default function App() {
  useEffect(() => {
    void initializeRevenueCatSdkOnLaunch();
  }, []);

  return (
    <AuthProvider>
      <ToastProvider>
        <Routes>
          {/* Public — must be accessible without login (Apple App Store requirement) */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/privacy" element={<PrivacyPolicyPage />} />
          <Route path="/terms" element={<TermsOfServicePage />} />

          {/* Protected */}
          <Route element={<ProtectedRoute />}>
            <Route path="/success" element={<SuccessPage />} />
            <Route path="/*" element={<RecipifyApp />} />
          </Route>
        </Routes>
      </ToastProvider>
    </AuthProvider>
  );
}
