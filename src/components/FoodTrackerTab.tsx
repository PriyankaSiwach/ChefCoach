import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Capacitor } from "@capacitor/core";
import type { UserProfile } from "@/types";
import { useToast } from "./Toast";
import { appendManualMealToDailyLog, formatLocalDate } from "@/lib/gamification";
import {
  detectFoodNutrition,
  makeFoodScanThumbnail,
  readFoodScanHistory,
  removeFoodScanFromHistory,
  saveFoodScanToHistory,
  type FoodScanHistoryEntry,
  type FoodScanResult,
} from "@/lib/foodTracker";
import { NutritionDisclaimer } from "@/components/NutritionDisclaimer";
import { TrackerTabIcon } from "@/components/icons/TabIcons";
import {
  CameraIcon,
  MacroCarbsIcon,
  MacroFatIcon,
  MacroProteinIcon,
  RefreshCwIcon,
  TrashIcon,
} from "@/components/icons/AppIcons";

const isNative = Capacitor.isNativePlatform();

type ScanPhase = "capture" | "permission-denied" | "analyzing" | "result" | "error";

function timeAgoLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return `Today · ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday · ${time}`;
  return `${d.toLocaleDateString([], { month: "short", day: "numeric" })} · ${time}`;
}

function confidenceBadge(confidence: FoodScanResult["confidence"]): { label: string; className: string } {
  if (confidence === "high") {
    return { label: "High confidence", className: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  }
  if (confidence === "low") {
    return { label: "Low confidence — verify", className: "bg-amber-50 text-amber-700 border-amber-200" };
  }
  return { label: "Medium confidence", className: "bg-sky-50 text-sky-700 border-sky-200" };
}

function HistoryCard({ entry, onRemove }: { entry: FoodScanHistoryEntry; onRemove: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--white)] p-3">
      <img src={entry.thumbnailDataUri} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" />
      <div className="min-w-0 flex-1">
        <p className="text-wrap-safe truncate text-sm font-semibold text-[var(--text)]">{entry.name}</p>
        <p className="text-[11px] text-[var(--gray)]">
          {timeAgoLabel(entry.scannedAt)} · {entry.servingDescription}
        </p>
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-[var(--gray)]">
          <span className="font-semibold text-[var(--text)]">{entry.calories} kcal</span>
          <span>{entry.protein_g}g protein</span>
          <span>{entry.carbs_g}g carbs</span>
          <span>{entry.fat_g}g fat</span>
        </div>
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove scan"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--gray)] transition active:bg-red-50 active:text-red-500"
      >
        <TrashIcon className="h-4 w-4" />
      </button>
    </div>
  );
}

function ResultMacroCard({
  icon,
  label,
  value,
  color,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-2xl border border-[var(--border)] bg-[var(--white)] px-2 py-3">
      <span
        className="flex h-8 w-8 items-center justify-center rounded-full"
        style={{ backgroundColor: `${color}1A`, color }}
      >
        {icon}
      </span>
      <p className="text-base font-bold text-[var(--text)]">{value}g</p>
      <p className="text-[10px] uppercase tracking-wide text-[var(--gray)]">{label}</p>
    </div>
  );
}

type Props = {
  profile: UserProfile | null;
};

export function FoodTrackerTab({ profile }: Props) {
  const showToast = useToast();
  const [history, setHistory] = useState<FoodScanHistoryEntry[]>(() => readFoodScanHistory());
  const [scannerOpen, setScannerOpen] = useState(false);
  const [phase, setPhase] = useState<ScanPhase>("capture");
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [result, setResult] = useState<FoodScanResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const sync = () => setHistory(readFoodScanHistory());
    window.addEventListener("chefcoach-food-tracker-changed", sync);
    return () => window.removeEventListener("chefcoach-food-tracker-changed", sync);
  }, []);

  useEffect(() => {
    if (!scannerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [scannerOpen]);

  const totalScans = history.length;
  const todayCalories = useMemo(() => {
    const today = new Date().toDateString();
    return history
      .filter((e) => new Date(e.scannedAt).toDateString() === today)
      .reduce((sum, e) => sum + e.calories, 0);
  }, [history]);

  const resetScanState = () => {
    setPhase("capture");
    setCapturedImage(null);
    setResult(null);
    setErrorMsg(null);
    setSaved(false);
    setBusy(false);
  };

  const openScanner = () => {
    resetScanState();
    setScannerOpen(true);
  };

  const closeScanner = () => {
    setScannerOpen(false);
    window.setTimeout(resetScanState, 250);
  };

  const analyzeImage = async (dataUrl: string) => {
    setCapturedImage(dataUrl);
    setPhase("analyzing");
    setErrorMsg(null);
    try {
      const res = await detectFoodNutrition(dataUrl);
      setResult(res);
      setSaved(false);
      setPhase("result");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong. Try again.");
      setPhase("error");
    }
  };

  const handleCaptureNative = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");
      const status = await Camera.checkPermissions();
      let cameraGranted = status.camera === "granted" || status.camera === "limited";

      if (!cameraGranted && (status.camera === "prompt" || status.camera === "prompt-with-rationale")) {
        const req = await Camera.requestPermissions({ permissions: ["camera"] });
        cameraGranted = req.camera === "granted" || req.camera === "limited";
      }

      if (!cameraGranted) {
        setBusy(false);
        setPhase("permission-denied");
        return;
      }

      const photo = await Camera.getPhoto({
        quality: 85,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera,
        saveToGallery: false,
      });
      setBusy(false);
      if (photo.dataUrl) {
        void analyzeImage(photo.dataUrl);
      }
    } catch (err) {
      setBusy(false);
      const msg = String(err).toLowerCase();
      if (msg.includes("cancel") || msg.includes("dismissed") || msg.includes("no image")) {
        return;
      }
      if (
        msg.includes("denied") ||
        msg.includes("not authorized") ||
        msg.includes("authorization") ||
        msg.includes("restricted") ||
        msg.includes("permission")
      ) {
        setPhase("permission-denied");
        return;
      }
      setErrorMsg("Unable to open the camera. Try again.");
      setPhase("error");
    }
  };

  const handleOpenCamera = () => {
    if (isNative) {
      void handleCaptureNative();
    } else {
      fileInputRef.current?.click();
    }
  };

  const handleWebFileChange = (file: File) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = String(ev.target?.result ?? "");
      if (dataUrl) void analyzeImage(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const handleOpenSettings = () => {
    window.open("app-settings:", "_system");
  };

  const handleSaveResult = async () => {
    if (!result || !capturedImage || saved) return;
    setBusy(true);
    try {
      const thumb = await makeFoodScanThumbnail(capturedImage);
      const entry = saveFoodScanToHistory(result, thumb);
      setHistory((h) => [entry, ...h]);
      appendManualMealToDailyLog(
        formatLocalDate(new Date()),
        {
          name: result.name,
          calories: result.calories,
          protein_g: result.protein_g,
          carbs_g: result.carbs_g,
          fat_g: result.fat_g,
        },
        profile
      );
      setSaved(true);
      showToast(`Saved — ${result.calories} kcal logged to today`, "success");
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveHistoryEntry = (id: string) => {
    removeFoodScanFromHistory(id);
    setHistory((h) => h.filter((e) => e.id !== id));
  };

  return (
    <main className="tab-page w-full">
      <section className="app-shell px-4 pt-6 pb-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--gray)]">Food Tracker</p>
        <h1 className="mt-0.5 font-playfair text-2xl text-[var(--green)]">Scan any meal</h1>
        <p className="mt-1.5 text-sm text-[var(--gray)]">
          Point your camera at ready-made food to get instant calories &amp; macros.
        </p>
      </section>

      <section className="app-shell px-4 pt-3">
        <button
          type="button"
          onClick={openScanner}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--green)] py-4 text-base font-semibold text-white shadow-[0_6px_20px_rgba(45,80,22,0.24)] transition active:scale-[0.98]"
        >
          <TrackerTabIcon className="h-5 w-5" />
          Scan Food
        </button>

        {totalScans > 0 ? (
          <div className="mt-3 flex items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--cream)] px-4 py-2.5 text-xs text-[var(--gray)]">
            <span>
              {totalScans} total scan{totalScans === 1 ? "" : "s"}
            </span>
            <span className="font-semibold text-[var(--green)]">
              {todayCalories.toLocaleString()} kcal scanned today
            </span>
          </div>
        ) : null}
      </section>

      <section className="app-shell px-4 pt-5 pb-4">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--gray)]">Scan history</h2>

        {history.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-[var(--border)] bg-[var(--white)] px-5 py-10 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--green-pale)]">
              <TrackerTabIcon className="h-7 w-7 text-[var(--green)]" active />
            </div>
            <h3 className="mt-3 font-playfair text-lg text-[var(--green)]">No scans yet</h3>
            <p className="mx-auto mt-1.5 max-w-[240px] text-xs text-[var(--gray)]">
              Tap “Scan Food” above to log your first meal in seconds.
            </p>
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-2.5">
            {history.map((entry) => (
              <HistoryCard key={entry.id} entry={entry} onRemove={() => handleRemoveHistoryEntry(entry.id)} />
            ))}
          </div>
        )}
      </section>

      {/* Hidden file input — web fallback only (ignored on native) */}
      {!isNative ? (
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleWebFileChange(file);
            e.target.value = "";
          }}
        />
      ) : null}

      {/* ── Full-screen scanner overlay ─────────────────────────────────── */}
      {scannerOpen ? (
        <div className="screen-overlay z-[65] flex flex-col bg-[#0d1a05]">
          <div className="flex shrink-0 items-center justify-between px-4 py-3">
            <button
              type="button"
              onClick={closeScanner}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white active:bg-white/20"
              aria-label="Close scanner"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
              </svg>
            </button>
            <p className="font-playfair text-lg text-white">Food Scanner</p>
            <span className="w-10" aria-hidden />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-8">
            {phase === "capture" ? (
              <div className="flex h-full min-h-[420px] flex-col items-center justify-center gap-8 py-6">
                <div className="relative aspect-square w-full max-w-[300px]">
                  <div className="food-scan-frame absolute inset-0 rounded-[28px] border-2 border-dashed border-white/30" />
                  <span className="absolute left-0 top-0 h-9 w-9 rounded-tl-[20px] border-l-4 border-t-4 border-[var(--green-light)]" />
                  <span className="absolute right-0 top-0 h-9 w-9 rounded-tr-[20px] border-r-4 border-t-4 border-[var(--green-light)]" />
                  <span className="absolute bottom-0 left-0 h-9 w-9 rounded-bl-[20px] border-b-4 border-l-4 border-[var(--green-light)]" />
                  <span className="absolute bottom-0 right-0 h-9 w-9 rounded-br-[20px] border-b-4 border-r-4 border-[var(--green-light)]" />
                  <div className="absolute inset-x-3 top-3 h-0.5 overflow-hidden">
                    <span className="food-scan-line block h-full w-full rounded-full bg-[var(--green-light)] shadow-[0_0_12px_rgba(168,212,111,0.8)]" />
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <TrackerTabIcon className="h-10 w-10 text-white/25" />
                  </div>
                </div>

                <div className="text-center">
                  <p className="font-playfair text-xl text-white">Position your food in frame</p>
                  <p className="mx-auto mt-1.5 max-w-[280px] text-sm text-white/60">
                    Center your plate or packaged food, then tap the shutter to scan.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleOpenCamera}
                  disabled={busy}
                  className="flex h-20 w-20 items-center justify-center rounded-full border-[5px] border-white/25 bg-white shadow-[0_8px_24px_rgba(0,0,0,0.35)] transition active:scale-95 disabled:opacity-60"
                  aria-label="Open camera"
                >
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--green)]">
                    <CameraIcon className="h-6 w-6 text-white" />
                  </span>
                </button>
              </div>
            ) : phase === "permission-denied" ? (
              <div className="flex h-full min-h-[420px] flex-col items-center justify-center gap-4 py-6 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/15">
                  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden className="text-amber-400">
                    <path
                      d="M4 7h4l2-2h8a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V7z"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinejoin="round"
                    />
                    <line x1="2" y1="2" x2="22" y2="22" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-semibold text-white">Camera access needed</h3>
                  <p className="mx-auto mt-1.5 max-w-[260px] text-sm text-white/60">
                    Enable camera access in Settings to scan your food.
                  </p>
                </div>
                <div className="mt-4 flex w-full max-w-[280px] flex-col gap-2.5">
                  <button
                    type="button"
                    onClick={handleOpenSettings}
                    className="w-full rounded-2xl bg-[var(--green)] py-3 text-sm font-semibold text-white active:scale-[0.98]"
                  >
                    Open Settings
                  </button>
                  <button
                    type="button"
                    onClick={closeScanner}
                    className="py-2 text-sm text-white/60 underline underline-offset-2"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : phase === "analyzing" ? (
              <div className="flex h-full min-h-[420px] flex-col items-center justify-center gap-5 py-6 text-center">
                {capturedImage ? (
                  <img src={capturedImage} alt="" className="h-48 w-48 rounded-3xl object-cover opacity-70" />
                ) : null}
                <div className="flex items-center gap-2 text-white">
                  <span className="h-2.5 w-2.5 animate-ping rounded-full bg-[var(--green-light)]" />
                  <p className="font-playfair text-lg">Analyzing your food…</p>
                </div>
                <p className="max-w-[260px] text-sm text-white/60">Estimating calories, protein, carbs &amp; fat.</p>
              </div>
            ) : phase === "error" ? (
              <div className="flex h-full min-h-[420px] flex-col items-center justify-center gap-4 py-6 text-center">
                <p className="text-4xl">😕</p>
                <div>
                  <h3 className="text-base font-semibold text-white">Couldn’t analyze that photo</h3>
                  <p className="mx-auto mt-1.5 max-w-[280px] text-sm text-white/60">{errorMsg}</p>
                </div>
                <div className="mt-4 flex w-full max-w-[280px] flex-col gap-2.5">
                  <button
                    type="button"
                    onClick={() => setPhase("capture")}
                    className="w-full rounded-2xl bg-[var(--green)] py-3 text-sm font-semibold text-white active:scale-[0.98]"
                  >
                    Try Again
                  </button>
                  <button
                    type="button"
                    onClick={closeScanner}
                    className="py-2 text-sm text-white/60 underline underline-offset-2"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : phase === "result" && result ? (
              <div className="food-scan-result-enter pb-4 pt-2">
                <div className="overflow-hidden rounded-3xl bg-[var(--white)]">
                  {capturedImage ? (
                    <img src={capturedImage} alt={result.name} className="h-48 w-full object-cover" />
                  ) : null}
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="text-wrap-safe font-playfair text-xl text-[var(--text)]">{result.name}</h3>
                        <p className="mt-0.5 text-xs text-[var(--gray)]">{result.servingDescription}</p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${
                          confidenceBadge(result.confidence).className
                        }`}
                      >
                        {confidenceBadge(result.confidence).label}
                      </span>
                    </div>

                    <div className="mt-4 rounded-2xl bg-[var(--green-pale)] px-4 py-3 text-center">
                      <p className="text-3xl font-bold text-[var(--green)]">{result.calories}</p>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--green)]/80">
                        calories
                      </p>
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-2.5">
                      <ResultMacroCard
                        icon={<MacroProteinIcon className="h-4 w-4" />}
                        label="Protein"
                        value={result.protein_g}
                        color="#2D5016"
                      />
                      <ResultMacroCard
                        icon={<MacroCarbsIcon className="h-4 w-4" />}
                        label="Carbs"
                        value={result.carbs_g}
                        color="#d97706"
                      />
                      <ResultMacroCard
                        icon={<MacroFatIcon className="h-4 w-4" />}
                        label="Fat"
                        value={result.fat_g}
                        color="#7c3aed"
                      />
                    </div>

                    <div className="mt-3 flex flex-wrap justify-between gap-x-3 gap-y-1 rounded-2xl border border-[var(--border)] px-4 py-2.5 text-xs text-[var(--gray)]">
                      <span>
                        Fiber: <strong className="text-[var(--text)]">{result.fiber_g}g</strong>
                      </span>
                      <span>
                        Sugar: <strong className="text-[var(--text)]">{result.sugar_g}g</strong>
                      </span>
                      <span>
                        Sodium: <strong className="text-[var(--text)]">{result.sodium_mg}mg</strong>
                      </span>
                    </div>

                    {result.healthNote ? (
                      <p className="mt-3 rounded-xl bg-[var(--cream)] px-3 py-2 text-xs italic text-[var(--gray)]">
                        {result.healthNote}
                      </p>
                    ) : null}

                    <NutritionDisclaimer inline className="mt-3" />

                    <div className="mt-5 flex flex-col gap-2.5">
                      <button
                        type="button"
                        onClick={() => void handleSaveResult()}
                        disabled={busy || saved}
                        className={`w-full rounded-full py-3.5 text-sm font-semibold shadow-sm transition active:scale-[0.98] disabled:opacity-70 ${
                          saved ? "bg-emerald-100 text-emerald-700" : "bg-[var(--green)] text-white"
                        }`}
                      >
                        {saved ? "✓ Saved to history" : "Save to history & log"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPhase("capture")}
                        className="flex w-full items-center justify-center gap-1.5 rounded-full border-2 border-[var(--green)] py-3 text-sm font-semibold text-[var(--green)] active:opacity-80"
                      >
                        <RefreshCwIcon className="h-4 w-4" />
                        Scan another
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </main>
  );
}
