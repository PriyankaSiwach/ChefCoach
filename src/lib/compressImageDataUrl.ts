/** Downscale fridge photos before OpenAI vision — full iOS camera shots can be 10MB+. */
export async function compressImageDataUrl(
  dataUrl: string,
  maxDimension = 1280,
  quality = 0.82
): Promise<{ base64: string; mimeType: string }> {
  const fallbackMime = dataUrl.split(";")[0]?.split(":")[1] || "image/jpeg";
  const fallbackBase64 = dataUrl.split(",")[1] ?? "";

  if (typeof document === "undefined" || !fallbackBase64) {
    return { base64: fallbackBase64, mimeType: fallbackMime };
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      const longest = Math.max(width, height);
      const scale = longest > maxDimension ? maxDimension / longest : 1;
      width = Math.max(1, Math.round(width * scale));
      height = Math.max(1, Math.round(height * scale));

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve({ base64: fallbackBase64, mimeType: fallbackMime });
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      const out = canvas.toDataURL("image/jpeg", quality);
      resolve({
        base64: out.split(",")[1] ?? fallbackBase64,
        mimeType: "image/jpeg",
      });
    };
    img.onerror = () =>
      reject(new Error("Could not read the photo. Try a different image."));
    img.src = dataUrl;
  });
}
