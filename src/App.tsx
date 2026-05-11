import { useEffect } from "react";
import { Routes, Route } from "react-router-dom";
import { ToastProvider } from "@/components/Toast";
import { RecipifyApp } from "@/components/RecipifyApp";
import { SuccessPage } from "@/pages/SuccessPage";
import { LoginPage } from "@/pages/LoginPage";
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
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/success" element={<SuccessPage />} />
            <Route path="/*" element={<RecipifyApp />} />
          </Route>
        </Routes>
      </ToastProvider>
    </AuthProvider>
  );
}
