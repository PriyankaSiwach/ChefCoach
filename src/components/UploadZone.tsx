
import { useEffect, useRef, useState } from "react";
import { useCamera } from "@/hooks/useCamera";

type Props = {
  currentImage: string | null;
  onImageChange: (img: string | null) => void;
  loading: boolean;
};

export function UploadZone({ currentImage, onImageChange, loading }: Props) {
  const [dragOver, setDragOver] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const { startCamera, capture, stopCamera, stream } = useCamera();

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const readFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (ev) => onImageChange(String(ev.target?.result ?? ""));
    reader.readAsDataURL(file);
  };

  const openCamera = async () => {
    if (loading) return;
    try {
      const media = await startCamera();
      if (!media) {
        inputRef.current?.click();
        return;
      }
      setCameraOpen(true);
    } catch {
      setCameraOpen(false);
    }
  };

  const captureNow = () => {
    if (!videoRef.current) return;
    const img = capture(videoRef.current);
    if (!img) return;
    onImageChange(img);
    stopCamera();
    setCameraOpen(false);
  };

  const reset = () => {
    if (loading) return;
    onImageChange(null);
    stopCamera();
    setCameraOpen(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="mx-auto max-w-[600px] px-6 pb-8">
      <div
        className={`relative overflow-hidden rounded-[24px] border-2 p-10 text-center shadow-sm transition ${
          currentImage
            ? "border-[var(--green)] p-0"
            : dragOver
              ? "border-[var(--green-light)] bg-[var(--green-pale)] border-dashed"
              : "border-[var(--border)] bg-[var(--white)] border-dashed"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files[0];
          if (file?.type.startsWith("image/")) readFile(file);
        }}
      >
        {loading ? (
          <div className="absolute left-3 top-3 z-10 rounded-full bg-[var(--white)]/90 px-3 py-1 text-xs font-medium text-[var(--green)]">
            Analyzing image...
          </div>
        ) : null}
        {currentImage ? (
          <>
            <img src={currentImage} alt="Fridge" className="block max-h-[320px] w-full object-cover" />
            <button
              className="absolute right-3 top-3 rounded-full border border-[var(--border)] bg-[var(--white)] px-3 py-1.5 text-xs font-medium text-[var(--green)]"
              onClick={reset}
              disabled={loading}
            >
              ✕ Change
            </button>
          </>
        ) : cameraOpen ? (
          <div className="relative min-h-[320px] bg-black">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              className="max-h-[320px] w-full object-cover"
            />
            <button
              onClick={captureNow}
              className="absolute bottom-4 left-1/2 h-16 w-16 -translate-x-1/2 rounded-full border-4 border-white bg-[var(--orange)] text-white"
            >
              Capture
            </button>
          </div>
        ) : (
          <>
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--green-pale)] text-4xl">
              📸
            </div>
            <h3 className="font-playfair mb-1 text-[26px] text-[var(--green)]">Capture your fridge</h3>
            <p className="text-sm text-[var(--gray)]">Tap to snap or drag and drop an image here</p>
            <button
              className="mt-5 rounded-full bg-[var(--green)] px-6 py-3 text-sm font-medium text-white hover:bg-[var(--green-light)]"
              onClick={openCamera}
              disabled={loading}
            >
              📷 Take Photo
            </button>
            <button
              className="mt-3 block w-full text-center text-sm text-[var(--gray)] underline underline-offset-2"
              onClick={() => inputRef.current?.click()}
              disabled={loading}
            >
              or upload from gallery
            </button>
          </>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept="image/*"
        capture="environment"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) readFile(file);
        }}
        disabled={loading}
      />
    </div>
  );
}
