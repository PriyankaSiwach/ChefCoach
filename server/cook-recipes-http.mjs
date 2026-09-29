import { verifySupabaseAccessToken } from "./require-auth.mjs";
import { getAiIpLimiter, getAiUserLimiter } from "./rate-limit.mjs";
import { runCookRecipes } from "./cook-recipes-logic.mjs";
import { errorResponse, guardAiRequest } from "./ai-guards.mjs";

/**
 * Per-IP limit → auth (unchanged) → per-user limit → generate (LRU + daily cap + OpenAI).
 * Injectable deps keep this unit-testable.
 * @param {{ authorization?: string, body?: any, ip?: string }} [req]
 * @returns {Promise<{ status: number, headers?: Record<string, string>, json: any }>}
 */
export async function handleCookRecipesRequest(
  { authorization, body, ip } = {},
  {
    verifyUser = verifySupabaseAccessToken,
    limiter = getAiUserLimiter(),
    ipLimiter = getAiIpLimiter(),
    generate = runCookRecipes,
  } = {}
) {
  const gate = await guardAiRequest(
    { authorization, ip },
    { verifyUser, ipLimiter, userLimiter: limiter }
  );
  if (!gate.ok) return gate.response;

  try {
    const out = await generate(body ?? {});
    return { status: 200, json: out };
  } catch (err) {
    return errorResponse(err, "Recipe generation failed. Try again.");
  }
}
