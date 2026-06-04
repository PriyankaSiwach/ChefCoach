import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import { fileURLToPath } from "url";
import path from "path";
import { runCookRecipes } from "./cook-recipes-logic.mjs";
import { checkEmailExistsInSupabase } from "./auth-email-exists.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env.local") });
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

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

app.post("/api/cook-recipes", async (req, res) => {
  try {
    const out = await runCookRecipes(req.body ?? {});
    res.json(out);
  } catch (err) {
    const code = err.statusCode ?? 502;
    res.status(code).json({ error: err.message || "Recipe generation failed. Try again." });
  }
});

const PORT = Number(process.env.API_PORT) || 3001;
app.listen(PORT, () => {
  console.log(`API server http://127.0.0.1:${PORT}`);
});
