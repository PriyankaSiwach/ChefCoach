import type { CSSProperties } from "react";
import { useEffect } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Apple,
  Carrot,
  Cherry,
  ChefHat,
  Leaf,
  Salad,
  UtensilsCrossed,
  Wheat,
} from "lucide-react";
import { APP_NAME } from "@/lib/brand";

type Floater = {
  Icon: LucideIcon;
  className: string;
  style: CSSProperties;
};

const FLOATERS: Floater[] = [
  {
    Icon: Apple,
    className: "splash-float splash-float-a",
    style: { top: "14%", left: "10%", width: 36, height: 36 },
  },
  {
    Icon: Carrot,
    className: "splash-float splash-float-b",
    style: { top: "22%", right: "12%", width: 40, height: 40 },
  },
  {
    Icon: Cherry,
    className: "splash-float splash-float-c",
    style: { top: "38%", left: "6%", width: 32, height: 32 },
  },
  {
    Icon: Salad,
    className: "splash-float splash-float-d",
    style: { top: "48%", right: "8%", width: 38, height: 38 },
  },
  {
    Icon: Wheat,
    className: "splash-float splash-float-e",
    style: { bottom: "28%", left: "14%", width: 34, height: 34 },
  },
  {
    Icon: Leaf,
    className: "splash-float splash-float-f",
    style: { bottom: "22%", right: "16%", width: 30, height: 30 },
  },
  {
    Icon: UtensilsCrossed,
    className: "splash-float splash-float-g",
    style: { top: "30%", left: "42%", width: 28, height: 28, opacity: 0.35 },
  },
  {
    Icon: ChefHat,
    className: "splash-float splash-float-h",
    style: { bottom: "38%", right: "38%", width: 32, height: 32, opacity: 0.4 },
  },
];

type Props = {
  /** When true, plays fade-out and calls onExited after animation. */
  exiting?: boolean;
  onExited?: () => void;
};

export function SplashScreen({ exiting = false, onExited }: Props) {
  const accent = APP_NAME.slice(4);
  const base = APP_NAME.slice(0, 4);

  useEffect(() => {
    if (!exiting) return;
    const t = window.setTimeout(() => onExited?.(), 520);
    return () => window.clearTimeout(t);
  }, [exiting, onExited]);

  return (
    <div
      className={`splash-screen ${exiting ? "splash-screen--exit" : ""}`}
      role="status"
      aria-live="polite"
      aria-label="Loading ChefCoach"
    >
      <div className="splash-screen__glow" aria-hidden />

      {FLOATERS.map(({ Icon, className, style }, i) => (
        <span key={i} className={`splash-screen__floater ${className}`} style={style} aria-hidden>
          <Icon strokeWidth={1.75} className="h-full w-full" />
        </span>
      ))}

      <div className="splash-screen__center">
        <div className="splash-screen__logo-ring" aria-hidden>
          <ChefHat className="h-10 w-10 text-[#A8D46F]" strokeWidth={1.5} />
        </div>
        <h1 className="splash-screen__title font-playfair">
          {base}
          <span className="text-[#A8D46F]">{accent}</span>
        </h1>
        <p className="splash-screen__tagline">Your personal kitchen coach</p>
        <div className="splash-screen__loader" aria-hidden>
          <span />
          <span />
          <span />
        </div>
      </div>
    </div>
  );
}
