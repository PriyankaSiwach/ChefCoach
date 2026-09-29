import { describe, expect, it } from "vitest";
import { getBearerToken } from "./require-auth.mjs";

describe("getBearerToken", () => {
  it("reads a Bearer token and ignores extra header junk", () => {
    expect(getBearerToken("Bearer abc.def.ghi")).toBe("abc.def.ghi");
    expect(getBearerToken("bearer abc.def.ghi")).toBe("abc.def.ghi");
    expect(getBearerToken("")).toBe("");
    expect(getBearerToken("Basic abc")).toBe("");
    expect(getBearerToken("Bearer")).toBe("");
  });
});
