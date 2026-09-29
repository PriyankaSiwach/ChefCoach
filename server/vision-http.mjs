import { verifySupabaseAccessToken } from "./require-auth.mjs";
import { getAiIpLimiter, getAiUserLimiter } from "./rate-limit.mjs";
import { runFoodVision, runFridgeVision } from "./vision-logic.mjs";
import { errorResponse, guardAiRequest } from "./ai-guards.mjs";

/**
 * @typedef {{ authorization?: string, body?: unknown, ip?: string }} VisionRequest
 * @typedef {ReturnType<typeof getAiUserLimiter>} Limiter
 * @typedef {{
 *   analyze?: (body: any) => Promise<unknown>,
 *   verifyUser?: typeof verifySupabaseAccessToken,
 *   userLimiter?: Limiter,
 *   ipLimiter?: Limiter,
 * }} VisionDeps
 */

/**
 * @param {(body: any) => Promise<unknown>} run
 * @param {VisionRequest} req
 * @param {Omit<VisionDeps, "analyze">} deps
 * @returns {Promise<{ status: number, headers?: Record<string, string>, json: any }>}
 */
async function handleVision(run, { authorization, body, ip }, deps) {
  const {
    verifyUser = verifySupabaseAccessToken,
    userLimiter = getAiUserLimiter(),
    ipLimiter = getAiIpLimiter(),
  } = deps;

  const gate = await guardAiRequest({ authorization, ip }, { verifyUser, ipLimiter, userLimiter });
  if (!gate.ok) return gate.response;

  try {
    return { status: 200, json: await run(body ?? {}) };
  } catch (err) {
    return errorResponse(err, "Could not analyze this photo. Try again.");
  }
}

/**
 * POST /api/vision/fridge — photo → { ingredients }.
 * @param {VisionRequest} [req]
 * @param {VisionDeps} [deps]
 * @returns {Promise<{ status: number, headers?: Record<string, string>, json: any }>}
 */
export function handleFridgeVisionRequest(req = {}, { analyze = runFridgeVision, ...deps } = {}) {
  return handleVision(analyze, req, deps);
}

/**
 * POST /api/vision/food — photo → nutrition estimate.
 * @param {VisionRequest} [req]
 * @param {VisionDeps} [deps]
 * @returns {Promise<{ status: number, headers?: Record<string, string>, json: any }>}
 */
export function handleFoodVisionRequest(req = {}, { analyze = runFoodVision, ...deps } = {}) {
  return handleVision(analyze, req, deps);
}
