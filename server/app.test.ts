import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AddressInfo } from "node:net";
import { request, type Server } from "node:http";
import { createApp } from "./app.mjs";

const seen: Array<{ route: string; ip: string; bodyBytes: number }> = [];
const record = (route: string) => async ({ ip = "", body }: { ip?: string; body?: unknown } = {}) => {
  seen.push({ route, ip, bodyBytes: JSON.stringify(body ?? null).length });
  return { status: 200, json: { ok: true } };
};

let server: Server;
let base = "";

beforeAll(async () => {
  const app = createApp({
    handlers: {
      cookRecipes: record("cook"),
      fridgeVision: record("fridge"),
      foodVision: record("food"),
      subscriptionRefresh: record("subscription"),
    },
  });
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

type Reply = { status: number; headers: Record<string, string | string[] | undefined>; text: string };

// node:http rather than fetch: the test environment's fetch applies browser CORS rules.
const post = (path: string, body: string, headers: Record<string, string> = {}) =>
  new Promise<Reply>((resolve, reject) => {
    const req = request(
      `${base}${path}`,
      { method: "POST", headers: { "Content-Type": "application/json", ...headers } },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, headers: res.headers, text: Buffer.concat(chunks).toString() })
        );
      }
    );
    req.on("error", (err: NodeJS.ErrnoException) => {
      // The server may answer 413 and close before the whole oversize body is written.
      if (err.code === "EPIPE" || err.code === "ECONNRESET") return;
      reject(err);
    });
    req.end(body);
  });

describe("Express app", () => {
  beforeEach(() => {
    seen.length = 0;
  });

  it("accepts photo-sized bodies on vision routes", async () => {
    const photo = "A".repeat(2 * 1024 * 1024);
    const res = await post("/api/vision/fridge", JSON.stringify({ imageBase64: photo }));
    expect(res.status).toBe(200);
    expect(seen[0].route).toBe("fridge");
  });

  it("keeps the 100kb limit on non-vision routes", async () => {
    const res = await post("/api/cook-recipes", JSON.stringify({ pad: "A".repeat(200 * 1024) }));
    expect(res.status).toBe(413);
    expect(seen).toHaveLength(0);
  });

  it("rejects vision bodies over 6mb with 413", async () => {
    const res = await post("/api/vision/food", JSON.stringify({ imageBase64: "A".repeat(7 * 1024 * 1024) }));
    expect(res.status).toBe(413);
  });

  it("uses X-Forwarded-For from one proxy hop as the client IP", async () => {
    await post("/api/vision/food", "{}", { "X-Forwarded-For": "203.0.113.50" });
    expect(seen[0].ip).toBe("203.0.113.50");
  });

  it("routes POST /api/subscription/refresh with the client IP", async () => {
    const res = await post("/api/subscription/refresh", "{}", { "X-Forwarded-For": "203.0.113.60" });
    expect(res.status).toBe(200);
    expect(seen[0]).toMatchObject({ route: "subscription", ip: "203.0.113.60" });
  });

  it("allows the Capacitor iOS origin", async () => {
    const res = await post("/api/vision/fridge", "{}", { Origin: "capacitor://localhost" });
    expect(res.headers["access-control-allow-origin"]).toBe("capacitor://localhost");
  });
});

describe("malformed photo bodies are not logged or echoed", () => {
  const methods = ["log", "info", "warn", "error", "debug"] as const;
  let spies: ReturnType<typeof vi.spyOn>[] = [];

  beforeEach(() => {
    spies = methods.map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
  });

  afterEach(() => {
    spies.forEach((s) => s.mockRestore());
  });

  it("returns a generic 400 for invalid JSON", async () => {
    const marker = "PHOTO-SECRET-MARKER";
    const res = await post("/api/vision/fridge", `{"imageBase64":"${marker}`);

    expect(res.status).toBe(400);
    expect(res.text).not.toContain(marker);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });

  it("returns a generic 413 for oversize bodies", async () => {
    const res = await post("/api/vision/fridge", JSON.stringify({ imageBase64: "B".repeat(7 * 1024 * 1024) }));
    expect(res.status).toBe(413);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});
