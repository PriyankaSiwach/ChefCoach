import {
  IconLabel,
  MacroCaloriesIcon,
  MacroCarbsIcon,
  MacroFatIcon,
  MacroProteinIcon,
} from "@/components/icons/AppIcons";

type Props = {
  calories: number | string;
  protein: number | string;
  carbs: number | string;
  fat: number | string;
  className?: string;
};

export function MacroPills({ calories, protein, carbs, fat, className = "" }: Props) {
  return (
    <div className={`no-scrollbar flex flex-wrap gap-2 text-xs font-medium ${className}`}>
      <span className="rounded-full bg-[var(--orange-pale)] px-3 py-1 text-[var(--orange)]">
        <IconLabel icon={<MacroCaloriesIcon />}>{calories} kcal</IconLabel>
      </span>
      <span className="rounded-full bg-[var(--green-pale)] px-3 py-1 text-[var(--green)]">
        <IconLabel icon={<MacroProteinIcon />}>{protein}g protein</IconLabel>
      </span>
      <span className="rounded-full bg-[var(--orange-pale)] px-3 py-1 text-[var(--orange)]">
        <IconLabel icon={<MacroCarbsIcon />}>{carbs}g carbs</IconLabel>
      </span>
      <span className="rounded-full bg-[var(--orange-pale)] px-3 py-1 text-[var(--orange)]">
        <IconLabel icon={<MacroFatIcon />}>{fat}g fat</IconLabel>
      </span>
    </div>
  );
}
