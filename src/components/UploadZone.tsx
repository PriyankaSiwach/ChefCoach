/**
 * UploadZone — fridge photo picker
 *
 * Native iOS/Android:
 *   Uses @capacitor/camera → Camera.getPhoto({ source: CameraSource.Prompt })
 *   This triggers the native iOS action sheet:
 *     • Take Photo   (camera)
 *     • Choose Photo  (photo library)
 *     • Browse...     (Files app / iCloud Drive)
 *   Requires Info.plist keys:
 *     NSCameraUsageDescription
 *     NSPhotoLibraryUsageDescription
 *
 * Web (localhost / PWA):
 *   Falls back to a hidden <input type="file" accept="image/*">.
 *   Drag-and-drop also works on desktop.
 */

import { useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";

type Props = {
  currentImage: string | null;
  onImageChange: (img: string | null) => void;
  loading: boolean;
};

const isNative = Capacitor.isNativePlatform();

/** Lazy-load @capacitor/camera only on native to keep web bundle small. */
async function pickPhotoNative(): Promise<string | null> {
  try {
    const { Camera, CameraResultType, CameraSource } = await import(
      "@capacitor/camera"
    );
    const photo = await Camera.getPhoto({
      quality: 90,
      allowEditing: false,
      resultType: CameraResultType.DataUrl, // returns base64 data-URL directly
      source: CameraSource.Prompt,          // shows "Camera / Photo Library / Browse"
      promptLabelHeader: "Scan your fridge",
      promptLabelPhoto: "Choose from Photos",
      promptLabelPicture: "Take a Photo",
    });
    return photo.dataUrl ?? null;
  } catch (err) {
    // User cancelled or permission denied — not an error we need to surface
    const msg = String(err);
    if (
      msg.includes("cancelled") ||
      msg.includes("canceled") ||
      msg.includes("No image picked") ||
      msg.includes("User cancelled")
    ) {
      return null;
    }
    console.warn("[Camera]", err);
    return null;
  }
}

export function UploadZone({ currentImage, onImageChange, loading }: Props) {
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Helpers ────────────────────────────────────────────────────────────────

  const readFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (ev) => onImageChange(String(ev.target?.result ?? ""));
    reader.readAsDataURL(file);
  };

  const handlePickPhoto = async () => {
    if (loading) return;
    setError(null);

    if (isNative) {
      // Native: delegate entirely to @capacitor/camera (handles permissions too)
      const dataUrl = await pickPhotoNative();
      if (dataUrl) onImageChange(dataUrl);
    } else {
      // Web: open hidden file input
      inputRef.current?.click();
    }
  };

  const reset = () => {
    if (loading) return;
    onImageChange(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="pb-2">
      <div
        className={`relative overflow-hidden rounded-[20px] border-2 text-center shadow-[0_2px_16px_rgba(45,80,22,0.06)] transition ${
          currentImage
            ? "border-[var(--green)] p-0"
            : dragOver
              ? "border-[var(--green-light)] bg-[var(--green-pale)] border-dashed p-8"
              : "border-[var(--border)] bg-[var(--white)] border-dashed p-8"
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files[0];
          if (file?.type.startsWith("image/")) readFile(file);
        }}
      >
        {/* Analyzing overlay */}
        {loading && (
          <div className="absolute left-3 top-3 z-10 rounded-full bg-[var(--white)]/90 px-3 py-1 text-xs font-medium text-[var(--green)]">
            Analyzing image…
          </div>
        )}

        {currentImage ? (
          /* ── Image preview ── */
          <>
            <img
              src={currentImage}
              alt="Your fridge"
              className="block max-h-[320px] w-full object-cover"
            />
            <button
              type="button"
              className="absolute right-3 top-3 rounded-full border border-[var(--border)] bg-[var(--white)] px-3 py-1.5 text-xs font-medium text-[var(--green)] shadow-sm"
              onClick={reset}
              disabled={loading}
            >
              ✕ Change
            </button>
          </>
        ) : (
          /* ── Upload prompt ── */
          <>
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--green-pale)]">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden className="text-[var(--green)]">
                <path
                  d="M4 7h4l2-2h8a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V7z"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinejoin="round"
                />
                <circle cx="12" cy="13" r="3.25" stroke="currentColor" strokeWidth="1.75" />
              </svg>
            </div>

            <h3 className="mb-1 text-lg font-semibold text-[var(--text)]">
              Add a fridge photo
            </h3>

            <p className="mx-auto max-w-[260px] text-[13px] leading-relaxed text-[var(--gray)]">
              {isNative
                ? "Tap below to take a photo, choose from your library, or browse files"
                : "Tap to snap or drag and drop an image here"}
            </p>

            {error && (
              <p className="mt-3 rounded-xl bg-red-50 px-4 py-2 text-xs text-red-600">
                {error}
              </p>
            )}

            {isNative ? (
              /* ── Native: single button → iOS action sheet ── */
              <button
                type="button"
                className="mt-5 w-full rounded-2xl bg-[var(--green)] py-3.5 text-sm font-semibold text-white shadow-[0_4px_14px_rgba(45,80,22,0.22)] transition hover:bg-[var(--green-light)] active:scale-[0.98] disabled:opacity-60"
                onClick={() => void handlePickPhoto()}
                disabled={loading}
              >
                Choose photo
              </button>
            ) : (
              /* ── Web: two separate buttons ── */
              <div className="mt-5 flex flex-col gap-2.5">
                <button
                  type="button"
                  className="w-full rounded-2xl bg-[var(--green)] py-3.5 text-sm font-semibold text-white shadow-[0_4px_14px_rgba(45,80,22,0.22)] transition hover:bg-[var(--green-light)] active:scale-[0.98] disabled:opacity-60"
                  onClick={() => void handlePickPhoto()}
                  disabled={loading}
                >
                  Choose photo
                </button>
                <button
                  type="button"
                  className="w-full rounded-2xl border border-[var(--border)] bg-[var(--white)] py-2.5 text-sm font-medium text-[var(--gray)] transition hover:border-[var(--green)]/30 hover:text-[var(--green)]"
                  onClick={() => inputRef.current?.click()}
                  disabled={loading}
                >
                  Upload from gallery
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Hidden file input — web fallback only (ignored on native) */}
      {!isNative && (
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept="image/*"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) readFile(file);
          }}
          disabled={loading}
        />
      )}
    </div>
  );
}
