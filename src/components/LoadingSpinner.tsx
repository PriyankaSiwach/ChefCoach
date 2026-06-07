import { useEffect, useState } from "react";
import { Apple, Carrot, ChefHat, Cherry, Leaf, Salad } from "lucide-react";

const tips = [
  "Scanning your fridge...",
  "Reading what's in your photo…",
  "Calculating nutrition values...",
  "Crafting your recipes...",
];

const LOADING_ICONS = [Leaf, ChefHat, Carrot, Apple, Cherry, Salad];

export function LoadingSpinner({
  visible,
  inline = false,
}: {
  visible: boolean;
  inline?: boolean;
}) {
  const [tipIndex, setTipIndex] = useState(0);
  const [iconIndex, setIconIndex] = useState(0);
  const [tipVisible, setTipVisible] = useState(true);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!visible) {
      setTipIndex(0);
      setIconIndex(0);
      setProgress(0);
      return;
    }
    const id = window.setInterval(() => {
      setTipIndex((p) => (p + 1) % tips.length);
    }, 2500);
    return () => window.clearInterval(id);
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const id = window.setInterval(() => {
      setIconIndex((p) => (p + 1) % LOADING_ICONS.length);
    }, 800);
    return () => window.clearInterval(id);
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    setTipVisible(false);
    const id = window.setTimeout(() => setTipVisible(true), 60);
    return () => window.clearTimeout(id);
  }, [tipIndex, visible]);

  useEffect(() => {
    if (!visible) return;
    const startedAt = Date.now();
    const id = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const pct = Math.min(90, (elapsed / 15000) * 90);
      setProgress(pct);
    }, 80);
    return () => window.clearInterval(id);
  }, [visible]);

  if (!visible) return null;

  const SpinIcon = LOADING_ICONS[iconIndex];

  const content = (
    <div className="mx-auto flex w-full max-w-[420px] flex-col items-center gap-3 text-center">
      <div
        className="flex h-14 w-14 items-center justify-center text-[var(--green)]"
        style={{ animation: "loading-emoji-bounce 0.8s ease-in-out infinite" }}
        aria-live="polite"
      >
        <SpinIcon className="h-10 w-10" strokeWidth={1.75} aria-hidden />
      </div>
      <span
        className="text-sm transition-opacity duration-300"
        style={{ opacity: tipVisible ? 1 : 0 }}
      >
        {tips[tipIndex]}
      </span>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--green-pale)]">
        <div
          className="h-full rounded-full bg-[var(--green)] transition-[width] duration-150 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
  if (inline) return content;
  return <div className="mx-auto max-w-[600px] px-6 py-6 text-[var(--gray)]">{content}</div>;
}
