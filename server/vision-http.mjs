import { verifySupabaseAccessToken } from "./require-auth.mjs";
import { getAiIpLimiter, getAiUserLimiter } from "./rate-limit.mjs";
import { runFoodVision, runFridgeVision } from "./vision-logic.mjs";
import { errorResponse, guardAiRequest } from "./ai-guards.mjs";
import { getScanQuota, runWithScanQuota } from "./scan-quota.mjs";

/**
 * @typedef {{ authorization?: string, body?: unknown, ip?: string }} VisionRequest
 * @typedef {ReturnType<typeof getAiUserLimiter>} Limiter
 * @typedef {{
 *   analyze?: (body: any) => Promise<unknown>,
 *   verifyUser?: typeof verifySupabaseAccessToken,
 *   userLimiter?: Limiter,
 *   ipLimiter?: Limiter,
 *   quota?: import("./scan-quota.mjs").ScanQuota,
 * }} VisionDeps
 */

/**
 * @param {(body: any) => Promise<unknown>} run
 * @param {{ kind: "cook" | "track", counted: boolean }} scan
 * @param {VisionRequest} req
 * @param {Omit<VisionDeps, "analyze">} deps
 * @returns {Promise<{ status: number, headers?: Record<string, string>, json: any }>}
 */
async function handleVision(run, scan, { authorization, body, ip }, deps) {
  const {
    verifyUser = verifySupabaseAccessToken,
    userLimiter = getAiUserLimiter(),
    ipLimiter = getAiIpLimiter(),
    quota = getScanQuota(),
  } = deps;

  const gate = await guardAiRequest({ authorization, ip }, { verifyUser, ipLimiter, userLimiter });
  if (!gate.ok) return gate.response;

  try {
    const out = await runWithScanQuota({ userId: gate.userId, ...scan }, quota, () => run(body ?? {}));
    return out.ok ? { status: 200, json: out.value } : out.response;
  } catch (err) {
    return errorResponse(err, "Could not analyze this photo. Try again.");
  }
}

/**
 * POST /api/vision/fridge — photo → { ingredients }.
 * Blocked once free Cook scans are used; the Cook scan itself is counted by /api/cook-recipes.
 * @param {VisionRequest} [req]
 * @param {VisionDeps} [deps]
 * @returns {Promise<{ status: number, headers?: Record<string, string>, json: any }>}
 */
export function handleFridgeVisionRequest(req = {}, { analyze = runFridgeVision, ...deps } = {}) {
  return handleVision(analyze, { kind: "cook", counted: false }, req, deps);
}

/**
 * POST /api/vision/food — photo → nutrition estimate. One successful call = one Track scan.
 * @param {VisionRequest} [req]
 * @param {VisionDeps} [deps]
 * @returns {Promise<{ status: number, headers?: Record<string, string>, json: any }>}
 */
export function handleFoodVisionRequest(req = {}, { analyze = runFoodVision, ...deps } = {}) {
  return handleVision(analyze, { kind: "track", counted: true }, req, deps);
}
