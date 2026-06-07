import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.chefcoach.app",
  appName: "ChefCoach",
  webDir: "dist",
  ios: {
    contentInset: "automatic",
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
      iosText: "ChefCoach uses your camera to scan fridge contents and identify ingredients.",
    },
    // NSPhotoLibraryUsageDescription is set via the plist entry below.
    // Capacitor writes plugin-level strings; for photo library we use the
    // ios.plistStrings override which Capacitor >= 5.2 respects.
  },
};

export default config;
