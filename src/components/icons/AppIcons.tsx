import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  Apple,
  Ban,
  BarChart3,
  Bell,
  Bot,
  Bug,
  Calendar,
  Camera,
  Carrot,
  ChefHat,
  Cherry,
  CircleDot,
  ClipboardList,
  Clock,
  CreditCard,
  Droplets,
  Dumbbell,
  FileText,
  Fish,
  Flame,
  Heart,
  Leaf,
  Lock,
  MessageCircle,
  Moon,
  Pencil,
  RefreshCw,
  Salad,
  Send,
  ShieldCheck,
  ShoppingCart,
  SlidersHorizontal,
  Sparkles,
  Sprout,
  Star,
  Sun,
  Sunrise,
  Target,
  Timer,
  Trash2,
  Trophy,
  Unlock,
  User,
  Wheat,
  WheatOff,
  Zap,
} from "lucide-react";
import type { DietFilter } from "@/types";

/** Default inline icon size for chips and buttons */
export const ICON_SM = "h-4 w-4 shrink-0";
export const ICON_MD = "h-5 w-5 shrink-0";

type IconWrapProps = {
  className?: string;
  strokeWidth?: number;
};

function I({ Icon, className = ICON_SM, strokeWidth = 2 }: IconWrapProps & { Icon: LucideIcon }) {
  return <Icon className={className} strokeWidth={strokeWidth} aria-hidden />;
}

export function DietFilterIcon({ value, className = ICON_SM }: { value: DietFilter; className?: string }) {
  switch (value) {
    case "None":
      return <I Icon={SlidersHorizontal} className={className} />;
    case "Vegetarian":
      return <I Icon={Leaf} className={className} />;
    case "Vegan":
      return <I Icon={Sprout} className={className} />;
    case "Pescatarian":
      return <I Icon={Fish} className={className} />;
    case "Halal":
      return <I Icon={ShieldCheck} className={className} />;
    case "Keto":
      return <I Icon={Flame} className={className} />;
    case "Gluten-free":
      return <I Icon={WheatOff} className={className} />;
    default:
      return <I Icon={SlidersHorizontal} className={className} />;
  }
}

export function MacroCaloriesIcon(props: IconWrapProps) {
  return <I Icon={Flame} className={props.className ?? ICON_SM} />;
}
export function MacroProteinIcon(props: IconWrapProps) {
  return <I Icon={Dumbbell} className={props.className ?? ICON_SM} />;
}
export function MacroCarbsIcon(props: IconWrapProps) {
  return <I Icon={Wheat} className={props.className ?? ICON_SM} />;
}
export function MacroFatIcon(props: IconWrapProps) {
  return <I Icon={CircleDot} className={props.className ?? ICON_SM} />;
}

export function ClockIcon(props: IconWrapProps) {
  return <I Icon={Clock} className={props.className ?? ICON_SM} />;
}
export function TargetIcon(props: IconWrapProps) {
  return <I Icon={Target} className={props.className ?? ICON_SM} />;
}
export function DropletsIcon(props: IconWrapProps) {
  return <I Icon={Droplets} className={props.className ?? ICON_SM} />;
}
export function AlertIcon(props: IconWrapProps) {
  return <I Icon={AlertTriangle} className={props.className ?? ICON_SM} />;
}
export function BanIcon(props: IconWrapProps) {
  return <I Icon={Ban} className={props.className ?? ICON_SM} />;
}
export function CameraIcon(props: IconWrapProps) {
  return <I Icon={Camera} className={props.className ?? ICON_SM} />;
}
export function PencilIcon(props: IconWrapProps) {
  return <I Icon={Pencil} className={props.className ?? ICON_SM} />;
}
export function ChartIcon(props: IconWrapProps) {
  return <I Icon={BarChart3} className={props.className ?? ICON_SM} />;
}
export function HeartIcon(props: IconWrapProps & { filled?: boolean }) {
  return (
    <Heart
      className={props.className ?? ICON_SM}
      strokeWidth={2}
      fill={props.filled ? "currentColor" : "none"}
      aria-hidden
    />
  );
}
export function CalendarIcon(props: IconWrapProps) {
  return <I Icon={Calendar} className={props.className ?? ICON_SM} />;
}
export function TimerIcon(props: IconWrapProps) {
  return <I Icon={Timer} className={props.className ?? ICON_SM} />;
}
export function SparklesIcon(props: IconWrapProps) {
  return <I Icon={Sparkles} className={props.className ?? ICON_SM} />;
}
export function SendIcon(props: IconWrapProps) {
  return <I Icon={Send} className={props.className ?? ICON_SM} />;
}
export function ChefHatIcon(props: IconWrapProps) {
  return <I Icon={ChefHat} className={props.className ?? ICON_SM} />;
}
export function UserIcon(props: IconWrapProps) {
  return <I Icon={User} className={props.className ?? ICON_SM} />;
}
export function BellIcon(props: IconWrapProps) {
  return <I Icon={Bell} className={props.className ?? ICON_SM} />;
}
export function StarIcon(props: IconWrapProps) {
  return <I Icon={Star} className={props.className ?? ICON_SM} />;
}
export function MessageIcon(props: IconWrapProps) {
  return <I Icon={MessageCircle} className={props.className ?? ICON_SM} />;
}
export function BugIcon(props: IconWrapProps) {
  return <I Icon={Bug} className={props.className ?? ICON_SM} />;
}
export function LockIcon(props: IconWrapProps) {
  return <I Icon={Lock} className={props.className ?? ICON_SM} />;
}
export function FileTextIcon(props: IconWrapProps) {
  return <I Icon={FileText} className={props.className ?? ICON_SM} />;
}
export function TrashIcon(props: IconWrapProps) {
  return <I Icon={Trash2} className={props.className ?? ICON_SM} />;
}
export function CreditCardIcon(props: IconWrapProps) {
  return <I Icon={CreditCard} className={props.className ?? ICON_SM} />;
}
export function RefreshCwIcon(props: IconWrapProps) {
  return <I Icon={RefreshCw} className={props.className ?? ICON_SM} />;
}
export function ClipboardListIcon(props: IconWrapProps) {
  return <I Icon={ClipboardList} className={props.className ?? ICON_SM} />;
}
export function SunriseIcon(props: IconWrapProps) {
  return <I Icon={Sunrise} className={props.className ?? ICON_SM} />;
}
export function SunIcon(props: IconWrapProps) {
  return <I Icon={Sun} className={props.className ?? ICON_SM} />;
}
export function MoonIcon(props: IconWrapProps) {
  return <I Icon={Moon} className={props.className ?? ICON_SM} />;
}
export function FlameIcon(props: IconWrapProps) {
  return <I Icon={Flame} className={props.className ?? ICON_SM} />;
}
export function ZapIcon(props: IconWrapProps) {
  return <I Icon={Zap} className={props.className ?? ICON_SM} />;
}
export function ShoppingCartIcon(props: IconWrapProps) {
  return <I Icon={ShoppingCart} className={props.className ?? ICON_SM} />;
}
export function UnlockIcon(props: IconWrapProps) {
  return <I Icon={Unlock} className={props.className ?? ICON_SM} />;
}
export function BotIcon(props: IconWrapProps) {
  return <I Icon={Bot} className={props.className ?? ICON_SM} />;
}
export function TrophyIcon(props: IconWrapProps) {
  return <I Icon={Trophy} className={props.className ?? ICON_SM} />;
}
export function SaladIcon(props: IconWrapProps) {
  return <I Icon={Salad} className={props.className ?? ICON_SM} />;
}
export function CarrotIcon(props: IconWrapProps) {
  return <I Icon={Carrot} className={props.className ?? ICON_SM} />;
}
export function AppleIcon(props: IconWrapProps) {
  return <I Icon={Apple} className={props.className ?? ICON_SM} />;
}
export function CherryIcon(props: IconWrapProps) {
  return <I Icon={Cherry} className={props.className ?? ICON_SM} />;
}

/** Four-column macro stat grid used on dashboard and plan cards */
export function MacroStatGrid({
  calories,
  protein,
  carbs,
  fat,
  className = "",
}: {
  calories: number | string;
  protein: number | string;
  carbs: number | string;
  fat: number | string;
  className?: string;
}) {
  const items = [
    { value: calories, label: "kcal", Icon: MacroCaloriesIcon, valueClass: "text-[var(--text)]" },
    { value: `${protein}g`, label: "protein", Icon: MacroProteinIcon, valueClass: "text-[var(--green)]" },
    { value: `${carbs}g`, label: "carbs", Icon: MacroCarbsIcon, valueClass: "text-[var(--text)]" },
    { value: `${fat}g`, label: "fat", Icon: MacroFatIcon, valueClass: "text-[var(--text)]" },
  ] as const;

  return (
    <div className={`grid grid-cols-4 gap-2 rounded-2xl bg-[var(--cream)] p-3 ${className}`}>
      {items.map(({ value, label, Icon, valueClass }) => (
        <div key={label} className="text-center">
          <p className={`text-base font-bold ${valueClass}`}>{value}</p>
          <p className="flex items-center justify-center gap-1 text-[10px] text-[var(--gray)]">
            <Icon className="h-3 w-3" />
            {label}
          </p>
        </div>
      ))}
    </div>
  );
}

/** Inline icon + text for chips and pills */
export function IconLabel({
  icon,
  children,
  className = "",
}: {
  icon: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      {icon}
      <span>{children}</span>
    </span>
  );
}
