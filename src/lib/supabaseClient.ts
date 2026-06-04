import { createClient } from "@supabase/supabase-js";

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? "";
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? "";

// Guard: catch the most common misconfiguration (missing .supabase.co suffix or empty value)
if (!url || !anonKey) {
  console.error(
    "[Supabase] VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set in .env.local. Auth will not work."
  );
} else if (!/^https:\/\/.+\.supabase\.co$/.test(url)) {
  console.warn(
    `[Supabase] VITE_SUPABASE_URL looks malformed: "${url}". Expected format: https://<project-ref>.supabase.co`
  );
}

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
