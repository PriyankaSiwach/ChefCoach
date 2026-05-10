import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import Stripe from "stripe";
import { createClerkClient } from "@clerk/backend";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env.local") });
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

const stripeKey = process.env.STRIPE_SECRET_KEY;
const priceId = process.env.STRIPE_PRICE_ID;
const appUrl = process.env.VITE_APP_URL || process.env.PUBLIC_APP_URL || "http://localhost:5173";
const stripe = stripeKey ? new Stripe(stripeKey) : null;

const clerkSecret = process.env.CLERK_SECRET_KEY;
const clerk = clerkSecret ? createClerkClient({ secretKey: clerkSecret }) : null;

app.post("/api/create-checkout", async (req, res) => {
  if (!stripe || !priceId) {
    res.status(500).json({ error: "Stripe is not configured." });
    return;
  }
  try {
    const { email } = req.body ?? {};
    const safeEmail = typeof email === "string" && email.includes("@") ? email : undefined;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_collection: "always",
      customer_email: safeEmail,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: { trial_period_days: 3 },
      success_url: `${appUrl.replace(/\/$/, "")}/#/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl.replace(/\/$/, "")}/#/?cancelled=true`,
    });

    res.json({ url: session.url });
  } catch {
    res.status(500).json({ error: "Unable to create checkout session." });
  }
});

app.post("/api/clerk-sync", async (req, res) => {
  if (!clerk) {
    res.status(500).json({ error: "Clerk is not configured." });
    return;
  }
  try {
    const { email } = req.body ?? {};
    const safeEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
    if (!safeEmail || !safeEmail.includes("@")) {
      res.status(400).json({ error: "Valid email is required." });
      return;
    }

    const existing = await clerk.users.getUserList({ emailAddress: [safeEmail], limit: 1 });
    if (existing.data.length === 0) {
      await clerk.users.createUser({
        emailAddress: [safeEmail],
        skipPasswordRequirement: true,
      });
    }

    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Unable to sync user with Clerk." });
  }
});

const PORT = Number(process.env.API_PORT) || 3001;
app.listen(PORT, () => {
  console.log(`API server http://127.0.0.1:${PORT}`);
});
