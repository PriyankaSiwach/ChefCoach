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
  loadingMessage?: string;
  /** Opens manual ingredient entry (always available alongside camera scan). */
  onAddManually?: () => void;
};

const isNative = Capacitor.isNativePlatform();

type PickResult =
  | { dataUrl: string; error?: never }
  | { dataUrl: null; error?: string };

/**
 * Lazy-load @capacitor/camera only on native to keep web bundle small.
 * Returns { dataUrl } on success, { dataUrl: null } on cancel,
 * or { dataUrl: null, error } when permission is denied or something crashes.
 */
async function pickPhotoNative(): Promise<PickResult> {
  try {
    const { Camera, CameraResultType, CameraSource } = await import(
      "@capacitor/camera"
    );
    const photo = await Camera.getPhoto({
      quality: 90,
      allowEditing: false,
      resultType: CameraResultType.DataUrl,
      source: CameraSource.Prompt,
      promptLabelHeader: "Scan your fridge",
      promptLabelPhoto: "Choose from Photos",
      promptLabelPicture: "Take a Photo",
    });
    return { dataUrl: photo.dataUrl ?? null } as PickResult;
  } catch (err) {
    const msg = String(err).toLowerCase();

    // User dismissed the action sheet or photo picker — silent, no error needed.
    // Match broad cancel patterns first so they are never misidentified as denials.
    if (
      msg.includes("cancel") ||
      msg.includes("no image picked") ||
      msg.includes("dismissed")
    ) {
      return { dataUrl: null };
    }

    // OS-level permission denial — only match phrases that unambiguously mean
    // the user (or MDM) has blocked camera / photo-library access.
    // "access" alone is intentionally excluded because iOS can surface it in
    // non-permission errors (e.g. file access), causing false positives.
    const isPermissionDenial =
      msg.includes("user denied access") ||
      msg.includes("access denied") ||
      msg.includes("permission denied") ||
      msg.includes("not authorized") ||
      msg.includes("authorization denied") ||
      msg.includes("restricted") ||
      (msg.includes("denied") && (msg.includes("camera") || msg.includes("photo")));

    if (isPermissionDenial) {
      return { dataUrl: null, error: "permission_denied" };
    }

    // Any other failure (e.g. hardware unavailable on simulator)
    console.warn("[Camera]", err);
    return {
      dataUrl: null,
      error: "Unable to open the camera. Please try again.",
    };
  }
}

export function UploadZone({ currentImage, onImageChange, loading, loadingMessage, onAddManually }: Props) {
  const [dragOver, setDragOver] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [genericError, setGenericError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Helpers ────────────────────────────────────────────────────────────────

  const readFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (ev) => onImageChange(String(ev.target?.result ?? ""));
    reader.readAsDataURL(file);
  };

  const handlePickPhoto = async () => {
    if (loading) return;
    setPermissionDenied(false);
    setGenericError(null);

    if (isNative) {
      const result = await pickPhotoNative();
      if (result.error === "permission_denied") {
        setPermissionDenied(true);
      } else if (result.error) {
        setGenericError(result.error);
      } else if (result.dataUrl) {
        onImageChange(result.dataUrl);
      }
    } else {
      // Web: open hidden file input
      inputRef.current?.click();
    }
  };

  const handleOpenSettings = () => {
    // Opens the app's own Settings page. Only triggered by explicit user tap,
    // never automatically after denial (Apple guideline 5.1.1).
    window.open("app-settings:", "_system");
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="pb-2">
      <div
        className={`relative overflow-hidden rounded-[20px] border-2 text-center shadow-[0_2px_16px_rgba(45,80,22,0.06)] transition ${
          currentImage
            ? "border-[var(--green)] p-0"
            : dragOver
              ? "border-[var(--green-light)] bg-[var(--green-pale)] border-dashed px-4 py-5 sm:p-6"
              : "border-[var(--border)] bg-[var(--white)] border-dashed px-4 py-5 sm:p-6"
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
            {loadingMessage ?? "Analyzing image…"}
          </div>
        )}

        {currentImage ? (
          /* ── Image preview ── */
          <>
            <img
              src={currentImage}
              alt="Your fridge"
              className="block max-h-[200px] w-full object-cover sm:max-h-[260px]"
            />
            <button
              type="button"
              className="absolute right-2 top-2 rounded-full border border-[var(--border)] bg-[var(--white)]/95 px-2 py-0.5 text-[10px] font-semibold text-[var(--green)] shadow-sm backdrop-blur-sm active:opacity-70"
              onClick={() => void handlePickPhoto()}
              disabled={loading}
              aria-label="Rescan fridge photo"
            >
              Rescan
            </button>
          </>
        ) : permissionDenied ? (
          /* ── Permission denied — calm, non-pushy panel ── */
          <div className="px-2 py-6 text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden className="text-amber-500">
                <path d="M4 7h4l2-2h8a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V7z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
                <line x1="2" y1="2" x2="22" y2="22" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-[var(--text)]">Camera access needed</h3>
            <p className="mx-auto mt-1.5 max-w-[260px] text-[12px] leading-relaxed text-[var(--gray)]">
              Camera access is needed to scan ingredients. You can still add ingredients manually.
            </p>

            <div className="mt-5 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={handleOpenSettings}
                className="w-full rounded-2xl border border-[var(--green)] bg-[var(--white)] py-3 text-sm font-semibold text-[var(--green)] transition active:bg-[var(--green-pale)]"
              >
                Open Settings
              </button>
              <button
                type="button"
                onClick={() => {
                  setPermissionDenied(false);
                  onAddManually?.();
                }}
                className="w-full rounded-2xl bg-[var(--green)] py-3 text-sm font-semibold text-white shadow-[0_4px_14px_rgba(45,80,22,0.22)] transition active:scale-[0.98]"
              >
                Add ingredients manually
              </button>
              <button
                type="button"
                onClick={() => setPermissionDenied(false)}
                className="py-2 text-sm text-[var(--gray)] underline underline-offset-2"
              >
                Cancel
              </button>
            </div>
          </div>
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

            <h3 className="mb-1 text-base font-semibold text-[var(--text)] sm:text-lg">
              Add a fridge photo
            </h3>

            <p className="mx-auto max-w-[280px] text-[12px] leading-relaxed text-[var(--gray)] sm:text-[13px]">
              {isNative
                ? "Scan a photo or type what you have — both paths use the same AI recipe matching"
                : "Upload a photo, drag and drop, or type ingredients manually"}
            </p>

            {genericError && (
              <p className="mt-3 rounded-xl bg-amber-50 px-4 py-2 text-xs text-amber-700">
                {genericError}
              </p>
            )}

            <div className="mt-5 flex flex-col gap-2.5">
              <button
                type="button"
                className="w-full rounded-2xl bg-[var(--green)] py-3.5 text-sm font-semibold text-white shadow-[0_4px_14px_rgba(45,80,22,0.22)] transition hover:bg-[var(--green-light)] active:scale-[0.98] disabled:opacity-60"
                onClick={() => void handlePickPhoto()}
                disabled={loading}
              >
                Scan Fridge
              </button>
              {!isNative ? (
                <button
                  type="button"
                  className="w-full rounded-2xl border border-[var(--border)] bg-[var(--white)] py-2.5 text-sm font-medium text-[var(--gray)] transition hover:border-[var(--green)]/30 hover:text-[var(--green)]"
                  onClick={() => inputRef.current?.click()}
                  disabled={loading}
                >
                  Upload from gallery
                </button>
              ) : null}
              <button
                type="button"
                className="w-full rounded-2xl border border-[var(--green)] bg-[var(--white)] py-3 text-sm font-semibold text-[var(--green)] transition hover:bg-[var(--green-pale)] active:scale-[0.98] disabled:opacity-60"
                onClick={() => onAddManually?.()}
                disabled={loading || !onAddManually}
              >
                Add ingredients manually
              </button>
            </div>
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
