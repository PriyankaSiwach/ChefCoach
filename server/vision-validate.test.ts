import { describe, expect, it } from "vitest";
import {
  MAX_IMAGE_BYTES,
  MAX_PROFILE_NOTE_CHARS,
  parseVisionImageBody,
} from "./vision-validate.mjs";
import { JPEG_HEADER, PNG_HEADER, WEBP_HEADER, imageBase64, jpegBase64 } from "./test-images";

function statusOf(fn: () => unknown): number | undefined {
  try {
    fn();
  } catch (e) {
    return (e as { statusCode?: number }).statusCode;
  }
  return undefined;
}

describe("parseVisionImageBody", () => {
  it("accepts JPEG, PNG, and WebP and reports the detected type", () => {
    expect(parseVisionImageBody({ imageBase64: jpegBase64(), mimeType: "image/jpeg" }).mimeType).toBe("image/jpeg");
    expect(parseVisionImageBody({ imageBase64: imageBase64(PNG_HEADER) }).mimeType).toBe("image/png");
    expect(parseVisionImageBody({ imageBase64: imageBase64(WEBP_HEADER) }).mimeType).toBe("image/webp");
  });

  it("strips a data: URL prefix", () => {
    const b64 = jpegBase64();
    const out = parseVisionImageBody({ imageBase64: `data:image/jpeg;base64,${b64}` });
    expect(out.imageBase64).toBe(b64);
  });

  it("rejects a missing image", () => {
    expect(statusOf(() => parseVisionImageBody({}))).toBe(400);
  });

  it("rejects invalid base64", () => {
    expect(statusOf(() => parseVisionImageBody({ imageBase64: "not base64!!" }))).toBe(400);
  });

  it("rejects bytes that are not a supported image", () => {
    const gif = Buffer.from("GIF89a-some-bytes").toString("base64");
    expect(statusOf(() => parseVisionImageBody({ imageBase64: gif }))).toBe(400);
  });

  it("rejects a declared type that does not match the file contents", () => {
    expect(
      statusOf(() => parseVisionImageBody({ imageBase64: jpegBase64(), mimeType: "image/png" }))
    ).toBe(400);
  });

  it("rejects images over the size limit", () => {
    const big = imageBase64(JPEG_HEADER, "x".repeat(MAX_IMAGE_BYTES));
    expect(statusOf(() => parseVisionImageBody({ imageBase64: big }))).toBe(400);
  });

  it("never echoes image data in error messages", () => {
    const secret = Buffer.from("GIF89a-PHOTO-SECRET").toString("base64");
    try {
      parseVisionImageBody({ imageBase64: secret });
    } catch (e) {
      expect((e as Error).message).not.toContain(secret);
    }
  });

  it("trims and truncates profileNote", () => {
    const out = parseVisionImageBody({
      imageBase64: jpegBase64(),
      profileNote: `  ${"a".repeat(MAX_PROFILE_NOTE_CHARS + 50)}  `,
    });
    expect(out.profileNote).toHaveLength(MAX_PROFILE_NOTE_CHARS);
  });
});
