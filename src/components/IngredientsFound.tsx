import { useEffect, useRef, useState } from "react";
import { SparklesIcon } from "@/components/icons/AppIcons";

function ingredientAllergenWarning(
  ingredient: string,
  userAllergens: string[]
): string | null {
  const t = ingredient.toLowerCase();
  for (const raw of userAllergens) {
    const a = raw.toLowerCase();
    if (a === "none" || !a) continue;
    if (
      (a === "dairy" || a === "milk") &&
      /milk|cream|cheese|yogurt|butter|dairy|paneer|feta|parmesan|cheddar|ricotta/.test(t)
    )
      return raw;
    if (
      (a === "nuts" || a === "nut") &&
      /nut|almond|cashew|walnut|pecan|pistachio|peanut|hazelnut/.test(t)
    )
      return raw;
    if ((a === "eggs" || a === "egg") && /egg/.test(t)) return raw;
    if (
      a === "shellfish" &&
      /shrimp|prawn|crab|lobster|clam|mussel|scallop|oyster|shellfish/.test(t)
    )
      return raw;
    if ((a === "soy" || a === "soya") && /soy|tofu|edamame|miso|tempeh/.test(t))
      return raw;
    if (
      (a === "gluten" || a === "wheat") &&
      /bread|flour|wheat|gluten|pasta|noodle|tortilla|wrap/.test(t)
    )
      return raw;
    if (
      a === "fish" &&
      /fish|salmon|tuna|cod|anchovy|sardine|halibut|tilapia/.test(t)
    )
      return raw;
  }
  return null;
}

type Props = {
  ingredients: string[];
  /** True when user has uploaded a fridge photo (ingredients may still be empty until scan). */
  hasUploadedPhoto: boolean;
  loading: boolean;
  loadingMessage?: string;
  onRemoveIngredient: (ingredient: string) => void;
  onAddIngredient: (ingredient: string) => void;
  onGenerateRecipes: () => void;
  /** Highlight chips that conflict with onboarding allergies */
  userAllergens?: string[];
  /** When true, show textarea-based manual entry (no photo required). */
  manualMode?: boolean;
  /** Receives the parsed ingredient list directly — avoids React state-timing
   *  issues when ingredients and generation are triggered in the same handler. */
  onGenerateWithIngredients?: (ingredients: string[]) => void;
};

export function IngredientsFound({
  ingredients,
  hasUploadedPhoto,
  loading,
  loadingMessage,
  onRemoveIngredient,
  onAddIngredient,
  onGenerateRecipes,
  userAllergens = [],
  manualMode = false,
  onGenerateWithIngredients,
}: Props) {
  const [draftIngredient, setDraftIngredient] = useState("");
  const [sparkleTick, setSparkleTick] = useState(0);
  const [clickTick, setClickTick] = useState(0);
  const [ripple, setRipple] = useState<{ x: number; y: number; key: number } | null>(null);
  // Manual-entry textarea state
  const [manualText, setManualText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!clickTick) return;
    const id = window.setTimeout(() => setClickTick(0), 200);
    return () => window.clearTimeout(id);
  }, [clickTick]);

  // Auto-focus the textarea when entering manual mode
  useEffect(() => {
    if (manualMode && ingredients.length === 0) {
      setTimeout(() => textareaRef.current?.focus(), 150);
    }
  }, [manualMode, ingredients.length]);

  if (!hasUploadedPhoto && !ingredients.length && !manualMode) return null;

  /** Parse textarea text → string array (comma or newline separated). */
  const parseManualText = () =>
    manualText
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);

  const submitManual = () => {
    const parsed = parseManualText();
    if (!parsed.length) return;
    // Pass parsed ingredients directly to avoid React state-timing issues —
    // setIngredients is async so reading `ingredients` immediately after would
    // return the stale empty array.
    if (onGenerateWithIngredients) {
      onGenerateWithIngredients(parsed);
    } else {
      parsed.forEach((ing) => onAddIngredient(ing));
      onGenerateRecipes();
    }
    setManualText("");
  };

  // ── Manual entry form (photo optional — same AI recipe path as scan) ──
  if (manualMode && ingredients.length === 0) {
    return (
      <section className="app-shell mb-4 px-4">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--white)] p-5 shadow-sm">
          <h4 className="font-playfair text-lg text-[var(--green)]">Add your ingredients</h4>
          <p className="mt-1 text-xs text-[var(--gray)]">
            List what you have — separate by comma or one per line.
          </p>
          <textarea
            ref={textareaRef}
            value={manualText}
            onChange={(e) => setManualText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                submitManual();
              }
            }}
            className="mt-3 w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--cream)] px-4 py-3 text-sm leading-relaxed outline-none transition focus:border-[var(--green)] focus:ring-2 focus:ring-[var(--green)]/20"
            rows={5}
            placeholder={"eggs, spinach, chicken breast, garlic\nrice, olive oil, tomatoes"}
          />
          <p className="mt-1.5 text-[11px] text-[var(--gray)]">
            e.g. &quot;eggs, milk, spinach&quot; or one ingredient per line
          </p>
          <button
            type="button"
            disabled={loading || !manualText.trim()}
            onClick={submitManual}
            className="mt-4 w-full rounded-full bg-[var(--green)] py-3 font-playfair text-lg text-white shadow-[0_4px_14px_rgba(45,80,22,0.22)] transition hover:brightness-110 disabled:opacity-50"
          >
            {loading ? (loadingMessage ?? "Finding recipes…") : "Find Matching Recipes"}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="app-shell mb-4 px-4">
      <div className="flex flex-col gap-4">
        {ingredients.length > 0 ? (
          <div className="flex flex-col gap-4">
            <h4 className="text-xs font-medium uppercase tracking-wider text-[var(--green)]">
              Ingredients detected
            </h4>
            <div className="flex flex-wrap gap-2">
              {ingredients.map((ingredient) => {
                const warn = ingredientAllergenWarning(ingredient, userAllergens);
                return (
                  <button
                    key={ingredient}
                    type="button"
                    className={`rounded-full border px-3 py-1 text-sm ${
                      warn
                        ? "border-red-300 bg-red-50 text-red-800"
                        : "border-[#C5D8A0] bg-[var(--white)] text-[var(--green)]"
                    }`}
                    onClick={() => onRemoveIngredient(ingredient)}
                    title="Remove ingredient"
                  >
                    {ingredient}
                    {warn ? (
                      <span className="ml-1 rounded bg-red-100 px-1 text-[10px] font-semibold text-red-700">
                        {warn}
                      </span>
                    ) : null}{" "}
                    <span className="ml-0.5 text-[10px] opacity-70" aria-hidden>
                      x
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2">
              <input
                value={draftIngredient}
                onChange={(e) => setDraftIngredient(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (!draftIngredient.trim()) return;
                    onAddIngredient(draftIngredient);
                    setDraftIngredient("");
                  }
                }}
                className="flex-1 rounded-full border border-[var(--border)] bg-[var(--white)] px-4 py-2 text-sm outline-none"
                placeholder="Add ingredient"
              />
              <button
                type="button"
                className="rounded-full border border-[var(--border)] bg-[var(--white)] px-4 py-2 text-sm text-[var(--green)]"
                onClick={() => {
                  if (!draftIngredient.trim()) return;
                  onAddIngredient(draftIngredient);
                  setDraftIngredient("");
                }}
              >
                Add
              </button>
            </div>
          </div>
        ) : null}
        <button
          type="button"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            setRipple({
              x: e.clientX - rect.left,
              y: e.clientY - rect.top,
              key: Date.now(),
            });
            setClickTick(Date.now());
            onGenerateRecipes();
          }}
          onMouseEnter={() => setSparkleTick(Date.now())}
          disabled={loading}
          className="relative w-full overflow-hidden rounded-full bg-[var(--green)] px-6 py-3 font-playfair text-lg text-white transition hover:brightness-110 disabled:opacity-80"
          style={{
            animation: loading
              ? "shimmerSweep 2s linear infinite"
              : clickTick
                ? "buttonPressBounce 0.2s ease"
                : undefined,
            transition: "filter 0.2s ease",
            backgroundImage: loading
              ? "linear-gradient(110deg, rgba(255,255,255,0.08) 20%, rgba(255,255,255,0.35) 40%, rgba(255,255,255,0.08) 60%)"
              : undefined,
            backgroundSize: loading ? "200% 100%" : undefined,
          }}
        >
          {sparkleTick ? (
            <span
              key={sparkleTick}
              className="pointer-events-none absolute left-1/2 top-1/2 text-sm"
              style={{ animation: "sparkleFloat 0.6s ease-out forwards" }}
              aria-hidden
            >
              <SparklesIcon className="h-4 w-4" aria-hidden />
            </span>
          ) : null}
          {ripple ? (
            <span
              key={ripple.key}
              className="pointer-events-none absolute h-8 w-8 rounded-full bg-white/40"
              style={{
                left: ripple.x - 16,
                top: ripple.y - 16,
                animation: "tapRipple 0.45s ease-out forwards",
              }}
              aria-hidden
            />
          ) : null}
          {loading ? (loadingMessage ?? "Scanning & generating…") : "Find matching recipes"}
        </button>
      </div>
    </section>
  );
}
