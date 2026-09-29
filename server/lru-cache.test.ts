import { describe, expect, it } from "vitest";
import { createLruCache } from "./lru-cache.mjs";

describe("LRU cache", () => {
  it("stores values on miss and returns them on hit", () => {
    const cache = createLruCache(2);
    expect(cache.get("a")).toBeUndefined();
    cache.set("a", { recipes: ["soup"] });
    expect(cache.get("a")).toEqual({ recipes: ["soup"] });
  });

  it("evicts the oldest unused entry once full", () => {
    const cache = createLruCache(2);
    cache.set("oldest", 1);
    cache.set("newer", 2);
    // "oldest" is least recently used; inserting a third entry evicts it.
    cache.set("newest", 3);

    expect(cache.has("oldest")).toBe(false);
    expect(cache.get("newer")).toBe(2);
    expect(cache.get("newest")).toBe(3);
    expect(cache.size).toBe(2);
  });
});
