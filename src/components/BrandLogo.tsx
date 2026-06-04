import { APP_NAME } from "@/lib/brand";

type Props = {
  className?: string;
};

/** Navbar wordmark: Chef + accent Coach */
export function BrandLogo({ className = "" }: Props) {
  const accent = APP_NAME.slice(4);
  const base = APP_NAME.slice(0, 4);
  return (
    <span className={`font-playfair text-2xl text-[var(--cream)] ${className}`.trim()}>
      {base}
      <span className="text-[#A8D46F]">{accent}</span>
    </span>
  );
}
