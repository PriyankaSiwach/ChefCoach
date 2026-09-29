import express from "express";
import cors from "cors";
import { checkEmailExistsInSupabase } from "./auth-email-exists.mjs";
import { deleteAccountForToken } from "./delete-account.mjs";
import { handleCookRecipesRequest } from "./cook-recipes-http.mjs";
import { handleFoodVisionRequest, handleFridgeVisionRequest } from "./vision-http.mjs";
import { handleSubscriptionRefreshRequest } from "./subscription-refresh.mjs";
import { clientIp } from "./client-ip.mjs";

const VISION_PATH_PREFIX = "/api/vision/";

function sendHandlerResult(res, out) {
  if (out.headers) {
    for (const [key, value] of Object.entries(out.headers)) {
      res.setHeader(key, value);
    }
  }
  res.status(out.status).json(out.json);
}

/**
 * @param {{
 *   handlers?: {
 *     cookRecipes?: typeof handleCookRecipesRequest,
 *     fridgeVision?: typeof handleFridgeVisionRequest,
 *     foodVision?: typeof handleFoodVisionRequest,
 *     subscriptionRefresh?: typeof handleSubscriptionRefreshRequest,
 *   },
 * }} [options]
 */
export function createApp({ handlers = {} } = {}) {
  const cookRecipes = handlers.cookRecipes ?? handleCookRecipesRequest;
  const fridgeVision = handlers.fridgeVision ?? handleFridgeVisionRequest;
  const foodVision = handlers.foodVision ?? handleFoodVisionRequest;
  const subscriptionRefresh = handlers.subscriptionRefresh ?? handleSubscriptionRefreshRequest;

  const allowedOrigins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    // Capacitor iOS WKWebView origin.
    "capacitor://localhost",
    process.env.WEB_ORIGIN,
  ].filter(Boolean);

  const app = express();

  // Hosts like Render sit behind one proxy hop; without this every request shares
  // the proxy's IP and the per-IP limiter becomes a single global bucket.
  const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS ?? 1);
  app.set("trust proxy", Number.isFinite(trustProxyHops) ? trustProxyHops : 1);

  app.use(
    cors({
      origin(origin, callback) {
        // Non-browser clients (curl) often send no Origin.
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(null, false);
      },
    })
  );

  const smallJson = express.json({ limit: "100kb" });
  const visionJson = express.json({ limit: "6mb" });
  app.use((req, res, next) => {
    if (req.path.startsWith(VISION_PATH_PREFIX)) {
      next();
      return;
    }
    smallJson(req, res, next);
  });

  /** Lets login distinguish missing account vs wrong password (service role required). */
  app.post("/api/auth/email-exists", async (req, res) => {
    const email = typeof req.body?.email === "string" ? req.body.email : "";
    const result = await checkEmailExistsInSupabase(email);
    if (!result.configured) {
      res.status(503).json({ error: "not_configured" });
      return;
    }
    if (result.error) {
      res.status(502).json({ error: result.error });
      return;
    }
    res.json({ exists: Boolean(result.exists) });
  });

  app.post("/api/auth/delete-account", async (req, res) => {
    const authHeader = req.headers.authorization ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    const result = await deleteAccountForToken(token);
    if (!result.configured) {
      res.status(503).json({ ok: false, error: "not_configured" });
      return;
    }
    if (!result.ok) {
      res.status(result.error?.includes("Invalid") ? 401 : 502).json({
        ok: false,
        error: result.error || "Account deletion failed.",
      });
      return;
    }
    res.json({ ok: true });
  });

  app.post("/api/cook-recipes", async (req, res) => {
    const out = await cookRecipes({
      authorization: req.headers.authorization,
      body: req.body ?? {},
      ip: clientIp(req),
    });
    sendHandlerResult(res, out);
  });

  app.post(`${VISION_PATH_PREFIX}fridge`, visionJson, async (req, res) => {
    const out = await fridgeVision({
      authorization: req.headers.authorization,
      body: req.body ?? {},
      ip: clientIp(req),
    });
    sendHandlerResult(res, out);
  });

  app.post(`${VISION_PATH_PREFIX}food`, visionJson, async (req, res) => {
    const out = await foodVision({
      authorization: req.headers.authorization,
      body: req.body ?? {},
      ip: clientIp(req),
    });
    sendHandlerResult(res, out);
  });

  app.post("/api/subscription/refresh", async (req, res) => {
    const out = await subscriptionRefresh({
      authorization: req.headers.authorization,
      ip: clientIp(req),
    });
    sendHandlerResult(res, out);
  });

  // Replaces Express's default handler, which logs the error stack and can echo
  // part of a malformed body (i.e. photo data) in JSON parse errors.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err?.type === "entity.too.large") {
      res.status(413).json({ error: "Request is too large. Please use a smaller photo." });
      return;
    }
    if (err?.type === "entity.parse.failed") {
      res.status(400).json({ error: "Invalid JSON body." });
      return;
    }
    const status = Number(err?.status || err?.statusCode);
    res
      .status(status >= 400 && status < 600 ? status : 500)
      .json({ error: "Request failed." });
  });

  return app;
}
