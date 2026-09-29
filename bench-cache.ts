/**
 * Assumptions
 * -----------
 * - Imports the real in-memory LRU from server/lru-cache.mjs (createLruCache).
 *   That factory is what the recipe-generation path uses; this script does not
 *   reimplement eviction or get/set behavior.
 * - OpenAI is never called. A fake generator returns a deterministic stub
 *   recipe payload keyed by the ingredient combo.
 * - Workload: 1,000 requests drawn from 100 unique ingredient combos with an
 *   80/20 skew (≈80% of requests hit the first 20% of combos). Selection uses
 *   a seeded PRNG so runs are reproducible.
 * - A cache hit means the fake generator was skipped (= one avoided "OpenAI"
 *   call). Misses call the fake generator and store the result in the LRU.
 * - Capacities 20, 50, and 100 are compared with the same request sequence so
 *   differences come only from cache size.
 *
 * Run: npx tsx bench-cache.ts
 */

import { createLruCache } from "./server/lru-cache.mjs";

const TOTAL_REQUESTS = 1_000;
const UNIQUE_COMBOS = 100;
const POPULAR_SHARE = 0.2; // 20% of combos
const POPULAR_TRAFFIC = 0.8; // receive ~80% of requests
const CAPACITIES = [20, 50, 100] as const;
const SEED = 42;

const INGREDIENTS = [
  "eggs",
  "spinach",
  "tomato",
  "onion",
  "garlic",
  "chicken",
  "rice",
  "beans",
  "cheese",
  "potato",
  "carrot",
  "broccoli",
  "pasta",
  "mushroom",
  "pepper",
  "tofu",
  "yogurt",
  "avocado",
  "lemon",
  "cilantro",
];

/** Mulberry32 — small seeded PRNG for reproducible workloads. */
function createRng(seed: number) {
  let t = seed >>> 0;
  return function next() {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function buildUniqueCombos(count: number): string[][] {
  const combos: string[][] = [];
  const seen = new Set<string>();
  let i = 0;
  while (combos.length < count) {
    // Include a unique token so every combo has a distinct cache key even
    // when the shared ingredient vocabulary is small.
    const a = INGREDIENTS[i % INGREDIENTS.length];
    const b = INGREDIENTS[(i * 3 + 1) % INGREDIENTS.length];
    const set = [a, b, `combo-${i}`].sort();
    const key = set.join("|");
    if (!seen.has(key)) {
      seen.add(key);
      combos.push(set);
    }
    i += 1;
  }
  return combos;
}

function cacheKey(ingredients: string[]): string {
  return JSON.stringify({ ingredients: [...ingredients].map((s) => s.toLowerCase()).sort() });
}

/** Fake recipe generator — stands in for OpenAI. */
function fakeGenerate(ingredients: string[]) {
  return {
    recipes: [
      {
        title: `Fake dish with ${ingredients.join(", ")}`,
        ingredients,
        source: "fake-generator",
      },
    ],
  };
}

function buildRequestSequence(
  combos: string[][],
  total: number,
  rng: () => number
): string[][] {
  const popularCount = Math.round(combos.length * POPULAR_SHARE);
  const requests: string[][] = [];
  for (let i = 0; i < total; i++) {
    let idx: number;
    if (rng() < POPULAR_TRAFFIC) {
      idx = Math.floor(rng() * popularCount);
    } else {
      idx = popularCount + Math.floor(rng() * (combos.length - popularCount));
    }
    requests.push(combos[idx]);
  }
  return requests;
}

type BenchResult = {
  capacity: number;
  total: number;
  hits: number;
  misses: number;
  hitRatePct: number;
  avoidedOpenAiCalls: number;
};

function runBench(
  capacity: number,
  requests: string[][]
): BenchResult {
  const cache = createLruCache(capacity);
  let hits = 0;
  let misses = 0;

  for (const ingredients of requests) {
    const key = cacheKey(ingredients);
    const cached = cache.get(key);
    if (cached !== undefined) {
      hits += 1;
      continue;
    }
    misses += 1;
    const result = fakeGenerate(ingredients);
    cache.set(key, result);
  }

  const total = requests.length;
  const hitRatePct = total === 0 ? 0 : (hits / total) * 100;
  return {
    capacity,
    total,
    hits,
    misses,
    hitRatePct,
    // Each hit skipped the fake generator (= avoided OpenAI call).
    avoidedOpenAiCalls: hits,
  };
}

function printResult(r: BenchResult) {
  console.log(`\n--- capacity ${r.capacity} ---`);
  console.log(`total requests:          ${r.total}`);
  console.log(`hits:                    ${r.hits}`);
  console.log(`misses:                  ${r.misses}`);
  console.log(`hit rate:                ${r.hitRatePct.toFixed(1)}%`);
  console.log(`fake OpenAI calls avoided: ${r.avoidedOpenAiCalls}`);
}

function main() {
  const rng = createRng(SEED);
  const combos = buildUniqueCombos(UNIQUE_COMBOS);
  // One shared sequence so capacity is the only variable.
  const requests = buildRequestSequence(combos, TOTAL_REQUESTS, rng);

  console.log("ChefCoach LRU cache benchmark");
  console.log(
    `${TOTAL_REQUESTS} requests · ${UNIQUE_COMBOS} unique combos · ~${POPULAR_TRAFFIC * 100}/${POPULAR_SHARE * 100} skew · seed=${SEED}`
  );

  for (const capacity of CAPACITIES) {
    printResult(runBench(capacity, requests));
  }
}

main();
