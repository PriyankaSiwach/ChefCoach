import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, ".env.local") });
dotenv.config({ path: path.resolve(__dirname, ".env") });

/** Dev-only: serve POST /api/* routes from Vite when the Express API is not running. */
function devApiPlugin(): Plugin {
  return {
    name: "dev-api-routes",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const pathname = (req.url ?? "").split("?")[0];
        if (req.method !== "POST") {
          next();
          return;
        }

        const readJsonBody = async (): Promise<Record<string, unknown>> => {
          const chunks: Buffer[] = [];
          for await (const chunk of req as AsyncIterable<Buffer>) {
            chunks.push(chunk);
          }
          const rawBody = Buffer.concat(chunks).toString("utf8");
          try {
            return rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {};
          } catch {
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "Invalid JSON body." }));
            throw new Error("invalid_json");
          }
        };

        if (pathname === "/api/auth/email-exists") {
          try {
            const body = await readJsonBody();
            const { checkEmailExistsInSupabase } = await import("./server/auth-email-exists.mjs");
            const email = typeof body.email === "string" ? body.email : "";
            const result = await checkEmailExistsInSupabase(email);
            if (!result.configured) {
              res.statusCode = 503;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "not_configured" }));
              return;
            }
            if (result.error) {
              res.statusCode = 502;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: result.error }));
              return;
            }
            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ exists: Boolean(result.exists) }));
          } catch (e) {
            if ((e as Error).message === "invalid_json") return;
            res.statusCode = 502;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "Email lookup failed." }));
          }
          return;
        }

        if (pathname === "/api/auth/delete-account") {
          try {
            const authHeader = req.headers.authorization ?? "";
            const token = authHeader.startsWith("Bearer ")
              ? authHeader.slice(7)
              : "";
            const { deleteAccountForToken } = await import("./server/delete-account.mjs");
            const result = await deleteAccountForToken(token);
            if (!result.configured) {
              res.statusCode = 503;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ ok: false, error: "not_configured" }));
              return;
            }
            if (!result.ok) {
              const code = result.error?.includes("Invalid") ? 401 : 502;
              res.statusCode = code;
              res.setHeader("Content-Type", "application/json");
              res.end(
                JSON.stringify({
                  ok: false,
                  error: result.error || "Account deletion failed.",
                })
              );
              return;
            }
            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ ok: true }));
          } catch {
            res.statusCode = 502;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ ok: false, error: "Account deletion failed." }));
          }
          return;
        }

        if (pathname !== "/api/cook-recipes") {
          next();
          return;
        }

        try {
          const body = await readJsonBody();
          const { runCookRecipes } = await import("./server/cook-recipes-logic.mjs");
          const out = await runCookRecipes(body);
          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(out));
        } catch (e: unknown) {
          if ((e as Error).message === "invalid_json") return;
          const err = e as { statusCode?: number; message?: string };
          const code = typeof err.statusCode === "number" ? err.statusCode : 502;
          res.statusCode = code;
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({ error: err.message || "Recipe generation failed. Try again." })
          );
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [devApiPlugin(), react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Capacitor plugins call registerPlugin() at import time using browser APIs.
  // Pre-bundling them with esbuild (which runs in Node) can silently break them.
  // Exclude all @capacitor/* and @revenuecat/* packages so Vite serves them
  // directly as ESM without any transformation.
  optimizeDeps: {
    exclude: [
      "@capacitor/core",
      "@capacitor/camera",
      "@capacitor/local-notifications",
      "@capacitor/push-notifications",
      "@revenuecat/purchases-capacitor",
      "@revenuecat/purchases-typescript-internal-esm",
    ],
  },
  server: {
    port: 5173,
    proxy: {
      "/api/auth": {
        target: `http://127.0.0.1:${Number(process.env.API_PORT) || 3001}`,
        changeOrigin: true,
      },
    },
  },
});
