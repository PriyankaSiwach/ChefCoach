import { httpError } from "./http-error.mjs";

/** Decoded image size limit. The route's JSON body limit (6mb) leaves room for base64 overhead. */
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const MAX_PROFILE_NOTE_CHARS = 500;

const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;
const DATA_URL_RE = /^data:([a-z/+.-]+);base64,/i;

const MIME_ALIASES = { "image/jpg": "image/jpeg" };

function detectImageMime(head) {
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    head.length >= 8 &&
    head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47 &&
    head[4] === 0x0d && head[5] === 0x0a && head[6] === 0x1a && head[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    head.length >= 12 &&
    head.toString("ascii", 0, 4) === "RIFF" &&
    head.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

function decodedByteLength(b64) {
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - padding;
}

/**
 * Validate a vision request body. Error messages never echo image data.
 * @returns {{ imageBase64: string, mimeType: string, profileNote: string }}
 */
export function parseVisionImageBody(body = {}) {
  let imageBase64 = typeof body.imageBase64 === "string" ? body.imageBase64.trim() : "";
  let declared = typeof body.mimeType === "string" ? body.mimeType.trim().toLowerCase() : "";

  const dataUrl = imageBase64.match(DATA_URL_RE);
  if (dataUrl) {
    declared = declared || dataUrl[1].toLowerCase();
    imageBase64 = imageBase64.slice(dataUrl[0].length);
  }

  if (!imageBase64) {
    throw httpError(400, "An image is required.");
  }
  if (decodedByteLength(imageBase64) > MAX_IMAGE_BYTES) {
    throw httpError(400, "Image is too large. Please use a smaller photo.");
  }
  if (imageBase64.length % 4 !== 0 || !BASE64_RE.test(imageBase64)) {
    throw httpError(400, "Image data is not valid base64.");
  }

  const detected = detectImageMime(Buffer.from(imageBase64.slice(0, 16), "base64"));
  if (!detected) {
    throw httpError(400, "Unsupported image type. Use JPEG, PNG, or WebP.");
  }
  const normalizedDeclared = MIME_ALIASES[declared] ?? declared;
  if (normalizedDeclared && normalizedDeclared !== detected) {
    throw httpError(400, "Image type does not match the file contents.");
  }

  const profileNote =
    typeof body.profileNote === "string"
      ? body.profileNote.trim().slice(0, MAX_PROFILE_NOTE_CHARS)
      : "";

  return { imageBase64, mimeType: detected, profileNote };
}
