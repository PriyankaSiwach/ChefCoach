/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OPENAI_API_KEY: string;
  readonly VITE_SKIP_ONBOARDING?: string;
  /** Backend origin for Capacitor builds, e.g. https://api.example.com */
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  /** RevenueCat public SDK key (Apple) from the RevenueCat dashboard */
  readonly VITE_REVENUECAT_IOS_API_KEY?: string;
  readonly VITE_REVENUECAT_ANDROID_API_KEY?: string;
  /** Entitlement identifier configured in RevenueCat (default: `pro`) */
  readonly VITE_REVENUECAT_ENTITLEMENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
