#!/usr/bin/env node
// Local proof, with measured numbers, that the LRU cache, rate limits, daily cap
// and free-scan quota work. Costs nothing:
//   - OpenAI is a fake that answers after a short delay (no key is sent anywhere).
//   - Supabase login and the scan_usage / subscriptions tables are in-memory fakes.
//   - Every other piece is the real server code: the Express app from
//     server/app.mjs, the real request handlers, limiter, cache, daily cap and quota.
//   - Any request that tries to leave this computer is blocked and fails the run.
//
// Run: node scripts/verify-safety.mjs   (optional: VERIFY_SEED=123 to repeat a run)

import { performance } from "node:perf_hooks";
import { randomUUID } from "node:crypto";
import { createApp } from "../server/app.mjs";
import { handleCookRecipesRequest } from "../server/cook-recipes-http.mjs";
import { handleFoodVisionRequest } from "../server/vision-http.mjs";
import { runCookRecipes } from "../server/cook-recipes-logic.mjs";
import { createLruCache } from "../server/lru-cache.mjs";
import { createDailyCap } from "../server/daily-cap.mjs";
import { createTokenBucketLimiter, getAiIpLimiter, getAiUserLimiter } from "../server/rate-limit.mjs";
import { createScanQuota, FREE_SCAN_LIMITS } from "../server/scan-quota.mjs";
import { httpError } from "../server/http-error.mjs";

// The recipe code refuses to run without a key. This placeholder only satisfies
// that check; the fake OpenAI below never sends it anywhere.
process.env.OPENAI_API_KEY = "fake-local-key-not-a-real-secret";
process.env.TRUST_PROXY_HOPS = "1";

// ── Same limits the server uses (code defaults unless set in your shell) ─────
function envNumber(...names) {
  for (const name of names) {
    const n = Number(process.env[name]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return undefined;
}
const USER_CAP = envNumber("AI_RATE_LIMIT_USER_CAPACITY", "COOK_RECIPES_RATE_LIMIT_CAPACITY") ?? 10;
const USER_REFILL_MS = envNumber("AI_RATE_LIMIT_USER_REFILL_MS", "COOK_RECIPES_RATE_LIMIT_REFILL_MS") ?? 3_000;
const IP_CAP = envNumber("AI_RATE_LIMIT_IP_CAPACITY") ?? 30;
const IP_REFILL_MS = envNumber("AI_RATE_LIMIT_IP_REFILL_MS") ?? 4_000;
const CACHE_CAPACITY = Number(process.env.COOK_RECIPES_CACHE_CAPACITY) || 100;

// ── Small helpers ────────────────────────────────────────────────────────────
const SEED = Number(process.env.VERIFY_SEED) || Date.now() % 1_000_000;
function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(SEED);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ms = (n) => `${n.toFixed(1)} ms`;
function percentile(values, p) {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}
function countBy(items) {
  const out = {};
  for (const x of items) out[x] = (out[x] ?? 0) + 1;
  return out;
}
function heading(title) {
  console.log(`\n${"═".repeat(78)}\n${title}\n${"═".repeat(78)}`);
}

// ── Fakes ────────────────────────────────────────────────────────────────────
/** Fake OpenAI: waits minMs–maxMs, then answers like the real chat API. */
function createFakeOpenAI({ minMs, maxMs }) {
  const fake = {
    calls: 0,
    /** @type {typeof fetch} */
    fetchImpl: async (_url, init) => {
      fake.calls += 1;
      const prompt = JSON.parse(String(init?.body ?? "{}"))?.messages?.[0]?.content ?? "";
      await sleep(minMs + rand() * (maxMs - minMs));
      if (prompt.includes("fail-openai")) {
        return new Response(JSON.stringify({ error: { message: "Fake OpenAI outage." } }), { status: 500 });
      }
      const content = JSON.stringify({
        recipes: [{ title: "Fake recipe", description: "Made by the fake OpenAI.", cookTime: "20 mins", difficulty: "Easy", matchedIngredients: [], missingOptionalIngredients: [], calories: 400, protein: 20, carbs: 40, fat: 15, allergyWarning: "", goalReason: "Test.", steps: ["Cook."] }],
      });
      return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  };
  return fake;
}

/** Fake Supabase login: the bearer token is the user ID. */
async function fakeVerifyUser(token) {
  return token
    ? { ok: true, userId: token }
    : { ok: false, status: 401, error: "Sign in required to generate recipes." };
}

/** Real createScanQuota with in-memory subscriptions + scan_usage tables. */
function memoryQuota({ proUsers = [] } = {}) {
  const rows = new Map(proUsers.map((id) => [id, { is_pro: true, expires_at: null, source: "comp" }]));
  const counts = new Map();
  const quota = createScanQuota({
    subscriptions: {
      get: async (id) => rows.get(id) ?? null,
      save: async (id, row) => void rows.set(id, row),
      mirrorToProfile: async () => {},
    },
    usage: {
      get: async (id, kind) => counts.get(`${id}:${kind}`) ?? 0,
      increment: async (id, kind) => {
        const key = `${id}:${kind}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      },
    },
    lookupPro: async () => ({ isPro: false, expiresAt: null }),
    compUserIds: new Set(),
  });
  return { quota, used: (id, kind) => counts.get(`${id}:${kind}`) ?? 0 };
}

const unlimited = () => createTokenBucketLimiter({ capacity: 1e9, refillIntervalMs: 1 });

async function fakeAnalyzeFood(body) {
  await sleep(5);
  if (body?.fail) throw httpError(502, "Fake vision outage.");
  return { name: "Fake salad", calories: 210 };
}

const PRO_USER = randomUUID();
/** Everything a section can swap. Defaults: no limits in the way, fast fake OpenAI. */
function freshDeps(overrides = {}) {
  return {
    userLimiter: unlimited(),
    ipLimiter: unlimited(),
    cache: createLruCache(CACHE_CAPACITY),
    dailyCap: createDailyCap({ max: 1e9 }),
    openai: createFakeOpenAI({ minMs: 2, maxMs: 6 }),
    quota: memoryQuota({ proUsers: [PRO_USER] }).quota,
    ...overrides,
  };
}
let deps = freshDeps();

// ── The real Express app, wired to the fakes ─────────────────────────────────
const app = createApp({
  handlers: {
    cookRecipes: (req) =>
      handleCookRecipesRequest(req, {
        verifyUser: fakeVerifyUser,
        limiter: deps.userLimiter,
        ipLimiter: deps.ipLimiter,
        quota: deps.quota,
        generate: (body) =>
          runCookRecipes(body, { cache: deps.cache, fetchImpl: deps.openai.fetchImpl, dailyCap: deps.dailyCap }),
      }),
    foodVision: (req) =>
      handleFoodVisionRequest(req, {
        verifyUser: fakeVerifyUser,
        userLimiter: deps.userLimiter,
        ipLimiter: deps.ipLimiter,
        quota: deps.quota,
        analyze: fakeAnalyzeFood,
      }),
  },
});

let BASE = "";
let blockedOutbound = 0;

async function post(path, { user, ip = "10.0.0.1", body }) {
  const t0 = performance.now();
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Forwarded-For": ip,
      ...(user ? { Authorization: `Bearer ${user}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, ms: performance.now() - t0, retryAfter: res.headers.get("retry-after"), json };
}
const recipeBody = (ingredients) => ({ ingredients, dietaryPreference: "None", maxCookTime: "any", count: 4 });
const cook = (user, ingredients, ip) => post("/api/cook-recipes", { user, ip, body: recipeBody(ingredients) });

const PANTRY = [
  "eggs", "spinach", "tomato", "rice", "chicken", "onion", "garlic", "pasta",
  "cheese", "milk", "beans", "carrot", "potato", "tofu", "salmon", "broccoli",
  "lemon", "yogurt", "bread", "mushroom", "pepper", "corn", "lentils", "avocado",
];
const ingredientSet = (i) => [PANTRY[i % 24], PANTRY[(i + 5) % 24], PANTRY[(i + 11) % 24]];

// ── 1. Cache ─────────────────────────────────────────────────────────────────
async function testCache() {
  heading("1. CACHE — 200 recipe requests, 20 different ingredient sets picked at random");
  deps = freshDeps({ openai: createFakeOpenAI({ minMs: 300, maxMs: 900 }) });
  console.log(`Fake OpenAI takes 300–900 ms per answer (a real one is usually slower).`);
  console.log(`Cache size: ${CACHE_CAPACITY} entries (same as the server). User is Pro, so the free-scan quota is not involved.\n`);

  const picks = [];
  const hits = [];
  const misses = [];
  const badStatuses = [];
  for (let i = 0; i < 200; i++) {
    const idx = Math.floor(rand() * 20);
    picks.push(idx);
    const before = deps.openai.calls;
    const r = await cook(PRO_USER, ingredientSet(idx));
    if (r.status !== 200) badStatuses.push(r.status);
    (deps.openai.calls > before ? misses : hits).push(r.ms);
  }

  const dist = countBy(picks);
  console.log("How often each ingredient set was sent (so you can judge how honest the hit rate is):");
  for (let i = 0; i < 20; i++) {
    const n = dist[i] ?? 0;
    console.log(`  set ${String(i + 1).padStart(2)}  ${ingredientSet(i).join(", ").padEnd(28)} ${String(n).padStart(3)}  ${"█".repeat(n)}`);
  }
  const distinct = Object.keys(dist).length;
  const hitRate = (hits.length / 200) * 100;
  console.log(`\nDifferent sets actually used: ${distinct}. Best possible: only the first request of each set misses.`);
  console.log(`Cache hits: ${hits.length} / 200 = ${hitRate.toFixed(1)}%`);
  console.log(`OpenAI calls made: ${deps.openai.calls}; OpenAI calls avoided by the cache: ${hits.length}`);
  console.log(`Latency of HITS   (answered from memory): p50 ${ms(percentile(hits, 50))}, p95 ${ms(percentile(hits, 95))}`);
  console.log(`Latency of MISSES (went to fake OpenAI): p50 ${ms(percentile(misses, 50))}, p95 ${ms(percentile(misses, 95))}`);
  console.log(`Note: real users repeat themselves less than this test, so expect a lower hit rate in production.`);

  const ok =
    badStatuses.length === 0 &&
    misses.length === distinct &&
    deps.openai.calls === distinct &&
    percentile(hits, 95) < percentile(misses, 50);
  return {
    ok,
    detail: `hit rate ${hitRate.toFixed(1)}%, ${hits.length} OpenAI calls avoided, hit p95 ${ms(percentile(hits, 95))} vs miss p50 ${ms(percentile(misses, 50))}${badStatuses.length ? `, non-200: ${badStatuses.join(",")}` : ""}`,
  };
}

// ── 2. LRU order ─────────────────────────────────────────────────────────────
async function testLru() {
  heading("2. LRU ORDER — a cache that holds only 3 entries");
  console.log("LRU = 'least recently used'. When the cache is full, the entry nobody has touched\nfor the longest time is thrown out. Reading an entry counts as touching it.\n");

  const sets = { A: ["apple"], B: ["banana"], C: ["cherry"], D: ["date"] };
  async function step(label, name) {
    const before = deps.openai.calls;
    const r = await cook(PRO_USER, sets[name]);
    const miss = deps.openai.calls > before;
    console.log(`  ${label.padEnd(44)} → ${miss ? "MISS (OpenAI called)" : "HIT  (from cache)  "}  HTTP ${r.status}`);
    return miss ? "miss" : "hit";
  }

  deps = freshDeps({ cache: createLruCache(3) });
  console.log("Run 1: read A again before adding D");
  const run1 = [
    await step("request A (cache: A)", "A"),
    await step("request B (cache: B, A)", "B"),
    await step("request C (cache full: C, B, A)", "C"),
    await step("read A again (A is now most recent)", "A"),
    await step("request D (over capacity → evicts oldest)", "D"),
    await step("check A — should survive", "A"),
    await step("check C — should survive", "C"),
    await step("check B — should have been evicted", "B"),
  ];

  deps = freshDeps({ cache: createLruCache(3) });
  console.log("\nRun 2 (comparison): same, but WITHOUT re-reading A");
  const run2 = [
    await step("request A", "A"),
    await step("request B", "B"),
    await step("request C", "C"),
    await step("request D (evicts oldest = A)", "D"),
    await step("check A — should have been evicted", "A"),
  ];

  const expected1 = ["miss", "miss", "miss", "hit", "miss", "hit", "hit", "miss"];
  const expected2 = ["miss", "miss", "miss", "miss", "miss"];
  const ok = run1.join() === expected1.join() && run2.join() === expected2.join() && deps.cache.size <= 3;
  return { ok, detail: "B (least recently used) evicted; re-read A survived; without the re-read A is evicted" };
}

// ── 3. Per-user rate limit ───────────────────────────────────────────────────
async function testUserLimit() {
  heading("3. PER-USER RATE LIMIT — burst of 40 requests from one user");
  console.log(`Server's per-user bucket: ${USER_CAP} requests up front, then 1 more every ${USER_REFILL_MS / 1000} s.`);
  console.log("Each request comes from a different IP so only the per-user limit is being tested.");
  console.log("The burst user is Pro, so the free-scan quota never answers 402 here.\n");
  deps = freshDeps({ userLimiter: getAiUserLimiter() });

  const BURST = 40;
  const user = PRO_USER;
  const burst = await Promise.all(
    Array.from({ length: BURST }, (_, i) => cook(user, ["eggs"], `10.3.0.${i + 1}`))
  );
  const codes = countBy(burst.map((r) => r.status));
  const n200 = codes[200] ?? 0;
  const n402 = codes[402] ?? 0;
  const n429 = codes[429] ?? 0;
  const otherCodes = Object.entries(codes).filter(([c]) => !["200", "402", "429"].includes(c));
  const nOther = otherCodes.reduce((sum, [, n]) => sum + n, 0);
  const total = n200 + n402 + n429 + nOther;
  const limited = burst.filter((r) => r.status === 429);
  const withRetry = limited.filter((r) => r.retryAfter && Number(r.retryAfter) >= 1);
  console.log(`  200 (allowed):           ${String(n200).padStart(2)}   (expected ${USER_CAP})`);
  console.log(`  402 (free scans used):   ${String(n402).padStart(2)}   (expected 0)`);
  console.log(`  429 (too many requests): ${String(n429).padStart(2)}   (expected ${BURST - USER_CAP})`);
  console.log(`  other:                   ${String(nOther).padStart(2)}   (expected 0)${otherCodes.length ? `  → ${otherCodes.map(([c, n]) => `${n}×${c}`).join(", ")}` : ""}`);
  console.log(`  total:                   ${String(total).padStart(2)}   (must equal ${BURST} requests sent)`);
  console.log(`  429s with a Retry-After header: ${withRetry.length} / ${limited.length}  (values seen: ${[...new Set(limited.map((r) => r.retryAfter))].join(", ")} s)`);

  const other = await cook(randomUUID(), ["eggs"], "10.3.1.1");
  console.log(`  A different user right after the burst: HTTP ${other.status}  (expected 200 — not blocked)`);

  const again = await cook(user, ["eggs"], "10.3.2.1");
  console.log(`  Same user again immediately:            HTTP ${again.status}  (expected 429 — bucket still empty)`);

  const waitMs = USER_REFILL_MS + 300;
  console.log(`  …waiting ${(waitMs / 1000).toFixed(1)} s for one token to refill…`);
  await sleep(waitMs);
  const refilled = await cook(user, ["eggs"], "10.3.2.2");
  const afterRefill = await cook(user, ["eggs"], "10.3.2.3");
  console.log(`  Same user after waiting:                HTTP ${refilled.status}  (expected 200 — one token came back)`);
  console.log(`  …and one more right away:               HTTP ${afterRefill.status}  (expected 429 — only one token refilled)`);

  const ok =
    total === BURST &&
    n200 === USER_CAP &&
    n429 === BURST - USER_CAP &&
    n402 === 0 &&
    nOther === 0 &&
    withRetry.length === limited.length &&
    other.status === 200 &&
    again.status === 429 &&
    refilled.status === 200 &&
    afterRefill.status === 429;
  return {
    ok,
    detail: `${n200}×200, ${n429}×429, ${n402}×402, ${nOther}×other (total ${total}/${BURST}); Retry-After ${withRetry.length}/${limited.length}; 2nd user ${other.status}; after wait ${refilled.status}`,
  };
}

// ── 4. Per-IP rate limit ─────────────────────────────────────────────────────
async function testIpLimit() {
  heading("4. PER-IP RATE LIMIT — 40 different users behind one IP");
  console.log(`Server's per-IP bucket: ${IP_CAP} requests up front, then 1 more every ${IP_REFILL_MS / 1000} s.`);
  console.log("Each user sends only 1 request, so the per-user limit never triggers.\n");
  deps = freshDeps({ ipLimiter: getAiIpLimiter() });

  const ip = "203.0.113.7";
  const burst = await Promise.all(Array.from({ length: 40 }, () => cook(randomUUID(), ["eggs"], ip)));
  const codes = countBy(burst.map((r) => r.status));
  const limited = burst.filter((r) => r.status === 429);
  const withRetry = limited.filter((r) => r.retryAfter);
  console.log(`  200 (allowed):          ${codes[200] ?? 0}   (expected ${IP_CAP})`);
  console.log(`  429 (too many requests): ${codes[429] ?? 0}   (expected ${40 - IP_CAP})`);
  console.log(`  429s with a Retry-After header: ${withRetry.length} / ${limited.length}`);

  const otherIp = await cook(randomUUID(), ["eggs"], "198.51.100.9");
  console.log(`  A user on a different IP right after:  HTTP ${otherIp.status}  (expected 200)`);

  const ok =
    (codes[200] ?? 0) === IP_CAP &&
    (codes[429] ?? 0) === 40 - IP_CAP &&
    withRetry.length === limited.length &&
    otherIp.status === 200;
  return { ok, detail: `${codes[200] ?? 0}×200, ${codes[429] ?? 0}×429 shared by 40 users on one IP; other IP OK` };
}

// ── 5. Daily cap ─────────────────────────────────────────────────────────────
async function testDailyCap() {
  heading("5. DAILY CAP — cap set to 5 OpenAI calls, 10 requests that miss the cache");
  const cap = createDailyCap({ max: 5 });
  deps = freshDeps({ dailyCap: cap });

  const results = [];
  for (let i = 0; i < 10; i++) {
    const r = await cook(PRO_USER, ingredientSet(i));
    results.push(r);
    console.log(`  new set ${String(i + 1).padStart(2)} → HTTP ${r.status}${r.retryAfter ? `  Retry-After ${r.retryAfter}s` : ""}`);
  }
  const passed = results.filter((r) => r.status === 200).length;
  const busy = results.filter((r) => r.status === 503);
  const callsAfterMisses = deps.openai.calls;
  console.log(`  → ${passed} passed, ${busy.length} got 503 'busy'. OpenAI calls: ${callsAfterMisses}. Cap used: ${cap.used}/5`);

  const hitStatuses = [];
  for (let round = 0; round < 3; round++) {
    for (let i = 0; i < 5; i++) hitStatuses.push((await cook(PRO_USER, ingredientSet(i))).status);
  }
  const hitOk = hitStatuses.filter((s) => s === 200).length;
  console.log(`  15 repeat requests for the 5 cached sets: ${hitOk}×200. Cap used is still ${cap.used}/5, OpenAI calls still ${deps.openai.calls}`);
  console.log("  → cache hits do not use up the daily cap.");

  const ok =
    passed === 5 &&
    busy.length === 5 &&
    busy.every((r) => r.retryAfter) &&
    callsAfterMisses === 5 &&
    hitOk === 15 &&
    cap.used === 5 &&
    deps.openai.calls === 5;
  return { ok, detail: `5×200 then 5×503; 15 cache hits all 200 and cap stayed at 5/5` };
}

// ── 6. Free-scan quota ───────────────────────────────────────────────────────
async function testQuota() {
  heading(`6. FREE-SCAN QUOTA — ${FREE_SCAN_LIMITS.cook} free Cook scans and ${FREE_SCAN_LIMITS.track} free Track scans`);
  const mem = memoryQuota({ proUsers: [PRO_USER] });
  deps = freshDeps({ quota: mem.quota });
  const checks = [];
  const record = (label, pass) => {
    checks.push(pass);
    console.log(`  ${pass ? "✓" : "✗"} ${label}`);
  };

  console.log("Cook, free user:");
  const f1 = randomUUID();
  const f1codes = [];
  for (let i = 0; i < 3; i++) f1codes.push((await cook(f1, ingredientSet(i))).status);
  const before4 = deps.openai.calls;
  const f1fourth = await cook(f1, ingredientSet(3));
  record(`3 scans → ${f1codes.join(", ")}; 4th → ${f1fourth.status} (${f1fourth.json?.code ?? "-"})`, f1codes.join() === "200,200,200" && f1fourth.status === 402 && f1fourth.json?.code === "free_scans_used");
  record(`the 4th request never reached OpenAI (calls before ${before4}, after ${deps.openai.calls})`, deps.openai.calls === before4);
  record(`server count for this user: ${mem.used(f1, "cook")} (expected 3)`, mem.used(f1, "cook") === 3);

  console.log("Cook, a failed scan does not count:");
  const f2 = randomUUID();
  const failed = await cook(f2, ["fail-openai"]);
  record(`OpenAI fails → HTTP ${failed.status}; count stays ${mem.used(f2, "cook")} (expected 0)`, failed.status === 502 && mem.used(f2, "cook") === 0);
  const f2codes = [];
  for (let i = 10; i < 13; i++) f2codes.push((await cook(f2, ingredientSet(i))).status);
  const f2fourth = await cook(f2, ingredientSet(13));
  record(`still gets 3 good scans → ${f2codes.join(", ")}; next → ${f2fourth.status}`, f2codes.join() === "200,200,200" && f2fourth.status === 402);

  console.log("Track, free user (counted separately from Cook):");
  const f3 = randomUUID();
  const food = (user, body) => post("/api/vision/food", { user, body });
  const tFail = await food(f3, { fail: true });
  record(`failed food scan → HTTP ${tFail.status}; Track count ${mem.used(f3, "track")} (expected 0)`, tFail.status === 502 && mem.used(f3, "track") === 0);
  const tCodes = [];
  for (let i = 0; i < 3; i++) tCodes.push((await food(f3, {})).status);
  const tFourth = await food(f3, {});
  record(`3 food scans → ${tCodes.join(", ")}; 4th → ${tFourth.status}`, tCodes.join() === "200,200,200" && tFourth.status === 402);
  const f3cook = await cook(f3, ingredientSet(5));
  record(`same user can still use Cook → HTTP ${f3cook.status}`, f3cook.status === 200);

  console.log("Pro user:");
  const proCodes = [];
  for (let i = 0; i < 10; i++) proCodes.push((await cook(PRO_USER, ingredientSet(i))).status);
  for (let i = 0; i < 5; i++) proCodes.push((await food(PRO_USER, {})).status);
  const proOk = proCodes.every((s) => s === 200);
  record(`10 Cook + 5 Track requests → ${proOk ? "all 200" : proCodes.join(",")}; nothing counted (cook ${mem.used(PRO_USER, "cook")}, track ${mem.used(PRO_USER, "track")})`, proOk && mem.used(PRO_USER, "cook") === 0 && mem.used(PRO_USER, "track") === 0);

  console.log("Fact check (not pass/fail): does a cache hit use up a free scan?");
  const f4 = randomUUID();
  const same = ["eggs", "rice"];
  const sameCodes = [];
  const callsBefore = deps.openai.calls;
  for (let i = 0; i < 3; i++) sameCodes.push((await cook(f4, same)).status);
  const sameFourth = await cook(f4, same);
  console.log(`  same ingredients 3× → ${sameCodes.join(", ")} with ${deps.openai.calls - callsBefore} OpenAI call(s); count ${mem.used(f4, "cook")}; 4th → ${sameFourth.status}`);
  console.log("  → yes: a free user's first-generation request counts even when answered from the cache.");

  const ok = checks.every(Boolean);
  return { ok, detail: `free: 3 OK then 402 (Cook and Track separately); failed scans not counted; Pro never blocked` };
}

// ── Run everything ───────────────────────────────────────────────────────────
const TESTS = [
  ["1. Cache", testCache],
  ["2. LRU order", testLru],
  ["3. Per-user rate limit", testUserLimit],
  ["4. Per-IP rate limit", testIpLimit],
  ["5. Daily cap", testDailyCap],
  ["6. Free-scan quota", testQuota],
];

async function main() {
  const server = await new Promise((resolve, reject) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
    s.on("error", reject);
  });
  BASE = `http://127.0.0.1:${server.address().port}`;

  const realFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith(`${BASE}/`)) {
      blockedOutbound += 1;
      return Promise.reject(new Error("Blocked a request that tried to leave this computer."));
    }
    return realFetch(input, init);
  };

  console.log(`Real Express app on ${BASE} with fake OpenAI and fake Supabase. Random seed: ${SEED}`);

  const rows = [];
  for (const [name, fn] of TESTS) {
    try {
      const { ok, detail } = await fn();
      rows.push({ name, status: ok ? "PASS" : "FAIL", detail });
    } catch (err) {
      rows.push({ name, status: "FAILED (could not run)", detail: err instanceof Error ? err.message : String(err) });
    }
  }
  if (blockedOutbound > 0) {
    rows.push({ name: "No outside network", status: "FAIL", detail: `${blockedOutbound} request(s) tried to leave this computer` });
  }

  heading("SUMMARY");
  const w = Math.max(...rows.map((r) => r.name.length));
  const sw = Math.max(...rows.map((r) => r.status.length));
  console.log(`${"Check".padEnd(w)}  ${"Result".padEnd(sw)}  Measured`);
  console.log(`${"─".repeat(w)}  ${"─".repeat(sw)}  ${"─".repeat(40)}`);
  for (const r of rows) console.log(`${r.name.padEnd(w)}  ${r.status.padEnd(sw)}  ${r.detail}`);

  const allPassed = rows.length === TESTS.length && rows.every((r) => r.status === "PASS");
  console.log(allPassed ? `\nRESULT: ALL ${TESTS.length} CHECKS PASSED` : "\nRESULT: FAILED");

  server.closeAllConnections?.();
  server.close();
  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.log(`\nRESULT: FAILED (could not run): ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
