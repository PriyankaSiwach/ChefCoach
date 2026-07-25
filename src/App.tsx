import { useState } from "react";
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
import { OnboardingModal } from "@/components/OnboardingModal";
import {
  isOnboardingCompleteOnDevice,
  markOnboardingCompleteOnDevice,
} from "@/lib/onboardingGate";

function AppRoutes() {
  const { initializing, session, continueAsGuest } = useAuth();
  const splash = useAppSplash(initializing);

  const [onboardingDone, setOnboardingDone] = useState<boolean>(() =>
    typeof window === "undefined" ? true : isOnboardingCompleteOnDevice()
  );

  const handleOnboardingComplete = () => {
    markOnboardingCompleteOnDevice();
    setOnboardingDone(true);
    // Enter the app as a guest — onboarding answers are already in localStorage.
    // Sign-in is optional and available from Profile or the login screen.
    continueAsGuest();
  };

  // Show onboarding ONLY when:
  //  1. Auth state is known (not still initializing — avoids flashing onboarding
  //     while Supabase is restoring a session from stored tokens), AND
  //  2. User is NOT authenticated (returning signed-in users bypass this gate), AND
  //  3. Onboarding has never been completed on this device.
  //
  // Logging out does NOT reset this — logout sends the user to /login, not onboarding.
  const showOnboarding = !initializing && !session && !onboardingDone;

  if (showOnboarding) {
    return (
      <>
        <OnboardingModal
          initialProfile={null}
          onComplete={handleOnboardingComplete}
        />
        {splash.show ? (
          <SplashScreen exiting={splash.exiting} onExited={splash.onExited} />
        ) : null}
      </>
    );
  }

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
