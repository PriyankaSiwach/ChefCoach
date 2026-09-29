import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";
import { createApp } from "./app.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env.local") });
dotenv.config({ path: path.join(__dirname, "..", ".env") });

// Hosts like Render set PORT; API_PORT is the local-dev override.
const PORT = Number(process.env.PORT || process.env.API_PORT) || 3001;
createApp().listen(PORT, () => {
  console.log(`API server http://127.0.0.1:${PORT}`);
});
