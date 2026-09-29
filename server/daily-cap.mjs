import { httpError } from "./http-error.mjs";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Global ceiling on OpenAI calls per UTC day. In-memory: a restart resets the
 * count, so pair this with a monthly budget limit on the OpenAI project.
 */
export function createDailyCap({ max }) {
  if (!(max > 0)) throw new Error("max must be positive");

  let day = -1;
  let used = 0;

  return {
    tryConsume(now = Date.now()) {
      const today = Math.floor(now / DAY_MS);
      if (today !== day) {
        day = today;
        used = 0;
      }
      if (used >= max) {
        return { allowed: false, remaining: 0, retryAfterMs: (today + 1) * DAY_MS - now };
      }
      used += 1;
      return { allowed: true, remaining: max - used, retryAfterMs: 0 };
    },
    get used() {
      return used;
    },
  };
}

/** Throws a 503 (with Retry-After) when today's cap is spent. */
export function consumeDailyCapOrThrow(cap) {
  const result = cap.tryConsume();
  if (result.allowed) return;
  const err = httpError(503, "ChefCoach is busy right now, try again later.");
  err.headers = {
    "Retry-After": String(Math.max(1, Math.ceil(result.retryAfterMs / 1000))),
  };
  throw err;
}

let openAiDailyCap;

export function getOpenAiDailyCap() {
  if (!openAiDailyCap) {
    const max = Number(process.env.OPENAI_DAILY_CAP);
    openAiDailyCap = createDailyCap({ max: Number.isFinite(max) && max > 0 ? max : 2_000 });
  }
  return openAiDailyCap;
}
