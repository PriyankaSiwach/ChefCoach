import { verifySupabaseAccessToken } from "./require-auth.mjs";
import { getAiIpLimiter, getAiUserLimiter } from "./rate-limit.mjs";
import { runCookRecipes } from "./cook-recipes-logic.mjs";
import { errorResponse, guardAiRequest } from "./ai-guards.mjs";
import { getScanQuota, runWithScanQuota } from "./scan-quota.mjs";

/** "Load more" sends the titles already shown; the app has never counted it as a scan. */
function isLoadMore(body) {
  return Array.isArray(body?.excludeTitles) && body.excludeTitles.length > 0;
}

/**
 * Per-IP limit → auth (unchanged) → per-user limit → free-scan gate → generate (LRU + daily cap + OpenAI).
 * A first generation counts as one Cook scan after it succeeds; "load more" is gated but not counted.
 * Injectable deps keep this unit-testable.
 * @param {{ authorization?: string, body?: any, ip?: string }} [req]
 * @param {{
 *   verifyUser?: typeof verifySupabaseAccessToken,
 *   limiter?: ReturnType<typeof getAiUserLimiter>,
 *   ipLimiter?: ReturnType<typeof getAiIpLimiter>,
 *   generate?: (body: any) => Promise<unknown>,
 *   quota?: import("./scan-quota.mjs").ScanQuota,
 * }} [deps]
 * @returns {Promise<{ status: number, headers?: Record<string, string>, json: any }>}
 */
export async function handleCookRecipesRequest(
  { authorization, body, ip } = {},
  {
    verifyUser = verifySupabaseAccessToken,
    limiter = getAiUserLimiter(),
    ipLimiter = getAiIpLimiter(),
    generate = runCookRecipes,
    quota = getScanQuota(),
  } = {}
) {
  const gate = await guardAiRequest(
    { authorization, ip },
    { verifyUser, ipLimiter, userLimiter: limiter }
  );
  if (!gate.ok) return gate.response;

  try {
    const out = await runWithScanQuota(
      { userId: gate.userId, kind: "cook", counted: !isLoadMore(body) },
      quota,
      () => generate(body ?? {})
    );
    return out.ok ? { status: 200, json: out.value } : out.response;
  } catch (err) {
    return errorResponse(err, "Recipe generation failed. Try again.");
  }
}
