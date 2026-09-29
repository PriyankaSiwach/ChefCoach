/** Minimal byte payloads that pass magic-byte detection; not decodable images. */
export const JPEG_HEADER = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46];
export const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
export const WEBP_HEADER = [...Buffer.from("RIFF"), 0x24, 0x00, 0x00, 0x00, ...Buffer.from("WEBPVP8 ")];

export function imageBase64(header: number[], extra = "photo-bytes"): string {
  return Buffer.concat([Buffer.from(header), Buffer.from(extra)]).toString("base64");
}

export const jpegBase64 = (extra?: string) => imageBase64(JPEG_HEADER, extra);
