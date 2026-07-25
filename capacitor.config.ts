import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.chefcoach.app",
  appName: "ChefCoach",
  webDir: "dist",
  ios: {
    // "never" — the web app handles all safe-area insets via CSS env() and
    // viewport-fit=cover. Using "automatic" causes WKWebView to shrink the
    // renderable area for safe zones, conflicting with the CSS env() values
    // and making content appear wider than the screen.
    contentInset: "never",
    preferredContentMode: "mobile",
    minVersion: "16.0",
  },
  server: {
    androidScheme: "https",
  },
  plugins: {
    /**
     * Privacy usage descriptions (required by App Store / iOS 17+).
     * These are written into Info.plist by `npx cap sync ios`.
     */
    Camera: {
      // NSCameraUsageDescription
      iosText: "ChefCoach uses your camera to scan fridge contents, ingredients, and meals for nutrition tracking.",
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    // NSPhotoLibraryUsageDescription is set via the plist entry below.
    // Capacitor writes plugin-level strings; for photo library we use the
    // ios.plistStrings override which Capacitor >= 5.2 respects.
  },
};

export default config;
