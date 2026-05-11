import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import { fileURLToPath } from "url";
import path from "path";
import { runCookRecipes } from "./cook-recipes-logic.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env.local") });
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

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
