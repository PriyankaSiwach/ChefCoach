import { createClient } from "@supabase/supabase-js";

function envConfig() {
  const url = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
  const serviceKey = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.VITE_SUPABASE_SERVICE_ROLE_KEY ||
    ""
  ).trim();
  return { url: url.replace(/\/$/, ""), serviceKey };
}

function userMatchesEmail(user, email) {
  return typeof user?.email === "string" && user.email.toLowerCase() === email;
}

/**
 * @param {string} email
 * @returns {Promise<{ configured: boolean; exists?: boolean; error?: string }>}
 */
export async function checkEmailExistsInSupabase(email) {
  const normalized =
    typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!normalized) {
    return { configured: true, exists: false, error: "Email required." };
  }

  const { url, serviceKey } = envConfig();
  if (!url || !serviceKey) {
    return { configured: false };
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const filterAttempts = [
    `email.eq.${normalized}`,
    `email.eq."${normalized}"`,
  ];

  for (const filter of filterAttempts) {
    try {
      const listRes = await fetch(
        `${url}/auth/v1/admin/users?filter=${encodeURIComponent(filter)}&per_page=5`,
        {
          headers: {
            Authorization: `Bearer ${serviceKey}`,
            apikey: serviceKey,
          },
        }
      );
      if (!listRes.ok) continue;
      const body = await listRes.json();
      const users = body?.users ?? body?.data?.users ?? [];
      if (Array.isArray(users) && users.some((u) => userMatchesEmail(u, normalized))) {
        return { configured: true, exists: true };
      }
      if (Array.isArray(users) && users.length === 0) {
        // Filter worked but no rows — still verify with paginated scan (filter can be strict)
      }
    } catch {
      /* try next filter */
    }
  }

  try {
    for (let page = 1; page <= 15; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) {
        return { configured: true, error: error.message };
      }
      const users = data?.users ?? [];
      if (users.some((u) => userMatchesEmail(u, normalized))) {
        return { configured: true, exists: true };
      }
      if (users.length < 200) {
        return { configured: true, exists: false };
      }
    }
    return { configured: true, exists: false };
  } catch (err) {
    return {
      configured: true,
      error: err instanceof Error ? err.message : "Email lookup failed.",
    };
  }
}
