
import { useEffect, useState } from "react";

const ROTATING_LINES = [
  "Zero food waste.",
  "Hit your macros today.",
  "Personalized to your goals.",
  "Fresh ideas every scan.",
];

/** Fixed scatter positions for faint emoji pattern (percent-based) */
const PATTERN_EMOJIS: Array<{ emoji: string; top: string; left: string; delay: string; duration: string }> = [
  { emoji: "🥦", top: "12%", left: "8%", delay: "0s", duration: "7s" },
  { emoji: "🍳", top: "22%", left: "78%", delay: "1.2s", duration: "6.5s" },
  { emoji: "🥕", top: "65%", left: "12%", delay: "0.5s", duration: "8s" },
  { emoji: "🥦", top: "78%", left: "85%", delay: "2s", duration: "7.5s" },
  { emoji: "🍳", top: "45%", left: "3%", delay: "1s", duration: "6s" },
  { emoji: "🥕", top: "18%", left: "52%", delay: "0.3s", duration: "7s" },
  { emoji: "🥦", top: "52%", left: "92%", delay: "1.5s", duration: "8.5s" },
  { emoji: "🍳", top: "88%", left: "38%", delay: "2.2s", duration: "6.8s" },
  { emoji: "🥕", top: "35%", left: "68%", delay: "0.8s", duration: "7.2s" },
  { emoji: "🥦", top: "8%", left: "34%", delay: "1.8s", duration: "7s" },
  { emoji: "🍳", top: "72%", left: "55%", delay: "0.2s", duration: "8s" },
  { emoji: "🥕", top: "58%", left: "22%", delay: "1.1s", duration: "6.4s" },
];

export function HeroSection() {
  const [lineIndex, setLineIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let fadeTimeout: number | undefined;
    const id = window.setInterval(() => {
      setVisible(false);
      fadeTimeout = window.setTimeout(() => {
        setLineIndex((i) => (i + 1) % ROTATING_LINES.length);
        setVisible(true);
      }, 300);
    }, 3000);
    return () => {
      window.clearInterval(id);
      if (fadeTimeout) window.clearTimeout(fadeTimeout);
    };
  }, []);

  return (
    <section className="relative min-h-[248px] overflow-hidden rounded-b-[28px] bg-gradient-to-br from-[var(--green)] via-[#356a1c] to-[var(--green-light)] px-5 pb-12 pt-9 text-center text-[var(--cream)] md:min-h-[260px] md:pb-14 md:pt-11">
      {/* Subtle radial highlight — lighter center */}
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_75%_65%_at_50%_38%,rgba(255,255,255,0.14)_0%,transparent_58%)]"
        aria-hidden
      />

      {/* Faint floating food emoji pattern */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        {PATTERN_EMOJIS.map((item, i) => (
          <span
            key={`${item.emoji}-${i}`}
            className="hero-food-emoji absolute select-none text-[clamp(1.1rem,3vw,1.65rem)] leading-none"
            style={{
              top: item.top,
              left: item.left,
              animationDelay: item.delay,
              animationDuration: item.duration,
            }}
          >
            {item.emoji}
          </span>
        ))}
      </div>

      <div className="relative z-10 mx-auto flex max-w-2xl flex-col items-center">
        <span className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/90 backdrop-blur-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--orange)]" aria-hidden />
          AI nutrition coach
        </span>

        <h1 className="font-playfair text-[clamp(32px,8.5vw,52px)] leading-[1.08] tracking-[-0.01em]">
          What&apos;s in your fridge?
        </h1>

        <div className="relative mx-auto mt-3 h-[1.6em] w-full max-w-md">
          <p
            key={ROTATING_LINES[lineIndex]}
            className="absolute inset-x-0 top-0 text-[15px] font-normal leading-relaxed text-white/85 transition-opacity duration-300 ease-in-out md:text-base"
            style={{ opacity: visible ? 1 : 0 }}
          >
            {ROTATING_LINES[lineIndex]}
          </p>
        </div>
      </div>
    </section>
  );
}
