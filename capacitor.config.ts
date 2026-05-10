import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.recipify.app",
  appName: "Recipify",
  webDir: "dist",
  ios: {
    contentInset: "automatic",
    preferredContentMode: "mobile",
  },
  server: {
    androidScheme: "https",
  },
};

export default config;
