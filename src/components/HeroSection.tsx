
import { useEffect, useState } from "react";

const ROTATING_LINES = [
  "Zero food waste.",
  "Hit your macros today.",
  "Personalized to your goals.",
  "Fresh ideas every scan.",
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
    <section className="relative w-full overflow-hidden rounded-b-[24px] bg-gradient-to-br from-[var(--green)] via-[#356a1c] to-[var(--green-light)] px-4 pb-8 pt-6 text-center text-[var(--cream)] sm:px-5 sm:pb-10 sm:pt-8">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_75%_65%_at_50%_38%,rgba(255,255,255,0.14)_0%,transparent_58%)]"
        aria-hidden
      />

      <div className="relative z-10 mx-auto flex w-full max-w-[430px] flex-col items-center">
        <span className="mb-2.5 inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/90 backdrop-blur-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--orange)]" aria-hidden />
          AI nutrition coach
        </span>

        <h1 className="font-playfair text-[clamp(28px,7.5vw,44px)] leading-[1.08] tracking-[-0.01em]">
          What&apos;s in your fridge?
        </h1>

        <div className="relative mx-auto mt-2 h-[1.5em] w-full max-w-md">
          <p
            key={ROTATING_LINES[lineIndex]}
            className="absolute inset-x-0 top-0 text-[14px] font-normal leading-relaxed text-white/85 transition-opacity duration-300 ease-in-out sm:text-[15px]"
            style={{ opacity: visible ? 1 : 0 }}
          >
            {ROTATING_LINES[lineIndex]}
          </p>
        </div>
      </div>
    </section>
  );
}
