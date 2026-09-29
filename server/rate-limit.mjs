/**
 * In-memory token bucket. One process only — use Redis (or similar) if you run
 * multiple API instances.
 *
 * Each key starts with `capacity` tokens. Tokens refill at 1 per `refillIntervalMs`.
 * Each check consumes 1 token when allowed.
 */
export function createTokenBucketLimiter({ capacity, refillIntervalMs, maxKeys = 10_000 }) {
  if (!(capacity > 0) || !(refillIntervalMs > 0)) {
    throw new Error("capacity and refillIntervalMs must be positive");
  }

  /** @type {Map<string, { tokens: number, updatedAt: number }>} */
  const buckets = new Map();

  // Keys are cheap to mint (anonymous users, rotating IPs), so drop buckets that
  // have refilled to capacity — forgetting them is equivalent to keeping them.
  function sweepIdle(now) {
    for (const [id, bucket] of buckets) {
      const elapsed = Math.max(0, now - bucket.updatedAt);
      if (bucket.tokens + elapsed / refillIntervalMs >= capacity) {
        buckets.delete(id);
      }
    }
  }

  return {
    get size() {
      return buckets.size;
    },
    check(key, now = Date.now()) {
      const id = String(key || "anonymous");
      let bucket = buckets.get(id);

      if (!bucket) {
        if (buckets.size >= maxKeys) sweepIdle(now);
        bucket = { tokens: capacity, updatedAt: now };
        buckets.set(id, bucket);
      } else {
        const elapsed = Math.max(0, now - bucket.updatedAt);
        bucket.tokens = Math.min(
          capacity,
          bucket.tokens + elapsed / refillIntervalMs
        );
        bucket.updatedAt = now;
      }

      if (bucket.tokens < 1) {
        const need = 1 - bucket.tokens;
        return {
          allowed: false,
          remaining: 0,
          retryAfterMs: Math.max(1, Math.ceil(need * refillIntervalMs)),
        };
      }

      bucket.tokens -= 1;
      return {
        allowed: true,
        remaining: Math.max(0, Math.floor(bucket.tokens)),
        retryAfterMs: 0,
      };
    },
    reset() {
      buckets.clear();
    },
  };
}

function envNumber(...names) {
  for (const name of names) {
    const n = Number(process.env[name]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return undefined;
}

let aiUserLimiter;
let aiIpLimiter;

/** Per-user bucket shared by every endpoint that can reach OpenAI. */
export function getAiUserLimiter() {
  if (!aiUserLimiter) {
    aiUserLimiter = createTokenBucketLimiter({
      capacity:
        envNumber("AI_RATE_LIMIT_USER_CAPACITY", "COOK_RECIPES_RATE_LIMIT_CAPACITY") ?? 10,
      refillIntervalMs:
        envNumber("AI_RATE_LIMIT_USER_REFILL_MS", "COOK_RECIPES_RATE_LIMIT_REFILL_MS") ?? 3_000,
    });
  }
  return aiUserLimiter;
}

/** Per-IP bucket, checked before auth so floods never reach Supabase. */
export function getAiIpLimiter() {
  if (!aiIpLimiter) {
    aiIpLimiter = createTokenBucketLimiter({
      capacity: envNumber("AI_RATE_LIMIT_IP_CAPACITY") ?? 30,
      refillIntervalMs: envNumber("AI_RATE_LIMIT_IP_REFILL_MS") ?? 4_000,
    });
  }
  return aiIpLimiter;
}
