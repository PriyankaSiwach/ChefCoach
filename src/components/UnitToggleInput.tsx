/**
 * UnitToggleInput
 * A number input that lets the user switch between two units (e.g. kg ↔ lb,
 * cm ↔ ft). The parent always works in the "base" unit (kg / cm). This
 * component converts to the display unit on the fly and converts back on
 * change, keeping the rest of the app free of unit logic.
 *
 * Usage:
 *   <UnitToggleInput
 *     type="weight"
 *     valueInBase={step1WeightKg}         // number in kg
 *     onChange={(kg) => setWeight(kg)}
 *     error={errors.weightKg}
 *   />
 *   <UnitToggleInput
 *     type="height"
 *     valueInBase={step1HeightCm}         // number in cm
 *     onChange={(cm) => setHeight(cm)}
 *     error={errors.heightCm}
 *   />
 */

import { useState } from "react";

// ── Conversion helpers ────────────────────────────────────────────────────────
const KG_TO_LB = 2.20462;
const LB_TO_KG = 1 / KG_TO_LB;

function kgToLb(kg: number) { return Math.round(kg * KG_TO_LB * 10) / 10; }
function lbToKg(lb: number) { return Math.round(lb * LB_TO_KG * 10) / 10; }

/** Convert cm to feet + inches display string, e.g. "5'10"" */
function cmToFtIn(cm: number): string {
  const totalIn = cm / 2.54;
  const ft = Math.floor(totalIn / 12);
  const inch = Math.round(totalIn % 12);
  return `${ft}'${inch}"`;
}

/** Convert cm to total decimal inches */
function cmToIn(cm: number) { return Math.round((cm / 2.54) * 10) / 10; }
function inToCm(inch: number) { return Math.round(inch * 2.54 * 10) / 10; }

// ── Component ─────────────────────────────────────────────────────────────────

type WeightProps = {
  type: "weight";
  /** Value in kilograms */
  valueInBase: string;
  onChange: (newDisplayValue: string) => void;
  error?: string;
  optional?: boolean;
};

type HeightProps = {
  type: "height";
  /** Value in centimetres */
  valueInBase: string;
  onChange: (newDisplayValue: string) => void;
  error?: string;
};

type Props = WeightProps | HeightProps;

export function UnitToggleInput(props: Props) {
  const { type, valueInBase, onChange, error } = props;
  const optional = type === "weight" ? props.optional : false;
  const [useImperial, setUseImperial] = useState(false);

  // ── Derive display value from base ────────────────────────────────────────
  const baseNum = parseFloat(valueInBase);
  const hasValue = valueInBase.trim() !== "" && Number.isFinite(baseNum);

  const displayValue = (() => {
    if (!hasValue) return "";
    if (type === "weight") {
      return useImperial ? String(kgToLb(baseNum)) : valueInBase;
    } else {
      return useImperial ? String(cmToIn(baseNum)) : valueInBase;
    }
  })();

  // ── Convert display value back to base on change ──────────────────────────
  const handleChange = (raw: string) => {
    if (raw.trim() === "") { onChange(""); return; }
    const n = parseFloat(raw);
    if (!Number.isFinite(n)) { onChange(raw); return; }

    if (!useImperial) {
      onChange(raw); // already in base unit
    } else if (type === "weight") {
      onChange(String(lbToKg(n)));
    } else {
      onChange(String(inToCm(n)));
    }
  };

  // ── Label + placeholder ───────────────────────────────────────────────────
  const label    = type === "weight"
    ? `Weight (${useImperial ? "lb" : "kg"})${optional ? " — optional" : ""}`
    : `Height (${useImperial ? "in" : "cm"})`;

  const ariaLbl  = type === "weight"
    ? (useImperial ? "Weight in pounds" : "Weight in kilograms")
    : (useImperial ? "Height in inches" : "Height in centimetres");

  const placeholder = type === "weight"
    ? (useImperial ? "154" : "70")
    : (useImperial ? "67" : "170");

  // Friendly ft/in hint when imperial height is set
  const heightHint = type === "height" && useImperial && hasValue
    ? `≈ ${cmToFtIn(baseNum)}`
    : null;

  return (
    <div>
      {/* Label row with toggle */}
      <div className="mb-1 flex items-center justify-between">
        <label className="text-xs font-medium text-[var(--gray)]">{label}</label>
        <button
          type="button"
          onClick={() => setUseImperial((v) => !v)}
          className="flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--gray-light)] px-2 py-0.5 text-[10px] font-semibold text-[var(--gray)] transition hover:border-[var(--green)] hover:text-[var(--green)]"
          aria-label={`Switch to ${useImperial ? (type === "weight" ? "kg" : "cm") : (type === "weight" ? "lb" : "in")}`}
        >
          {type === "weight" ? (
            useImperial ? "→ kg" : "→ lb"
          ) : (
            useImperial ? "→ cm" : "→ in"
          )}
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3" aria-hidden>
            <path fillRule="evenodd" d="M13.78 4.22a.75.75 0 0 1 0 1.06l-3.25 3.25 3.25 3.25a.75.75 0 1 1-1.06 1.06L9.47 9.53l-3.25 3.25a.75.75 0 0 1-1.06-1.06L8.41 8.47 5.16 5.22a.75.75 0 0 1 1.06-1.06l3.25 3.25 3.25-3.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      {/* Input */}
      <input
        aria-label={ariaLbl}
        className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
        type="number"
        step={type === "weight" ? "0.1" : "1"}
        placeholder={placeholder}
        value={displayValue}
        onChange={(e) => handleChange(e.target.value)}
      />

      {/* ft/in hint for imperial height */}
      {heightHint && (
        <p className="mt-0.5 text-[10px] text-[var(--gray)]">{heightHint}</p>
      )}

      {/* Validation error */}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
