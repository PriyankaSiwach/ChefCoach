import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, ".env.local") });
dotenv.config({ path: path.resolve(__dirname, ".env") });

/** Dev-only: serve POST /api/cook-recipes from Vite (shared OpenAI logic). */
function cookRecipesDevPlugin(): Plugin {
  return {
    name: "cook-recipes-dev-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const pathname = (req.url ?? "").split("?")[0];
        if (req.method !== "POST" || pathname !== "/api/cook-recipes") {
          next();
          return;
        }

        try {
          const chunks: Buffer[] = [];
          for await (const chunk of req as AsyncIterable<Buffer>) {
            chunks.push(chunk);
          }
          const rawBody = Buffer.concat(chunks).toString("utf8");
          let body: Record<string, unknown> = {};
          try {
            body = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {};
          } catch {
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "Invalid JSON body." }));
            return;
          }

          const { runCookRecipes } = await import("./server/cook-recipes-logic.mjs");
          const out = await runCookRecipes(body);
          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(out));
        } catch (e: unknown) {
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
  plugins: [cookRecipesDevPlugin(), react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
  },
});
