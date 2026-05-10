const KEY = "recipify_waste_impact";

export type WasteImpactData = {
  /** Rough estimate of kg food waste avoided by cooking at home (logged meals). */
  estimatedKgSaved: number;
  mealsCookedLogged: number;
};

function defaultData(): WasteImpactData {
  return { estimatedKgSaved: 0, mealsCookedLogged: 0 };
}

export function readWasteImpact(): WasteImpactData {
  if (typeof window === "undefined") return defaultData();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return defaultData();
    const p = JSON.parse(raw) as Partial<WasteImpactData>;
    return {
      estimatedKgSaved: typeof p.estimatedKgSaved === "number" ? p.estimatedKgSaved : 0,
      mealsCookedLogged: typeof p.mealsCookedLogged === "number" ? p.mealsCookedLogged : 0,
    };
  } catch {
    return defaultData();
  }
}

function write(data: WasteImpactData): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

/** Call when user logs a cooked meal — rough avoided-waste model (~0.35 kg per home meal vs takeaway). */
export function bumpWasteImpactAfterMealLog(): void {
  if (typeof window === "undefined") return;
  const cur = readWasteImpact();
  const next: WasteImpactData = {
    mealsCookedLogged: cur.mealsCookedLogged + 1,
    estimatedKgSaved: Math.round((cur.estimatedKgSaved + 0.35) * 100) / 100,
  };
  write(next);
  window.dispatchEvent(new CustomEvent("recipify-waste-changed"));
}
