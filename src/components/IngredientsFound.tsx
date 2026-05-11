import { useEffect, useState } from "react";

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
  onRemoveIngredient: (ingredient: string) => void;
  onAddIngredient: (ingredient: string) => void;
  onGenerateRecipes: () => void;
  /** Highlight chips that conflict with onboarding allergies */
  userAllergens?: string[];
};

export function IngredientsFound({
  ingredients,
  hasUploadedPhoto,
  loading,
  onRemoveIngredient,
  onAddIngredient,
  onGenerateRecipes,
  userAllergens = [],
}: Props) {
  const [draftIngredient, setDraftIngredient] = useState("");
  const [sparkleTick, setSparkleTick] = useState(0);
  const [clickTick, setClickTick] = useState(0);
  const [ripple, setRipple] = useState<{ x: number; y: number; key: number } | null>(null);

  useEffect(() => {
    if (!clickTick) return;
    const id = window.setTimeout(() => setClickTick(0), 200);
    return () => window.clearTimeout(id);
  }, [clickTick]);

  if (!hasUploadedPhoto && !ingredients.length) return null;

  return (
    <section className="mx-auto mb-6 max-w-[600px] px-6">
      <div className="flex flex-col gap-4">
        {ingredients.length > 0 ? (
          <div className="flex flex-col gap-4">
            <h4 className="text-xs font-medium uppercase tracking-wider text-[var(--green)]">
              🥦 Ingredients detected
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
                      <span className="ml-1 inline-flex items-center rounded bg-red-100 px-1 text-[10px] font-semibold text-red-700">
                        ⚠️ {warn}
                      </span>
                    ) : null}{" "}
                    ✕
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
              ✨
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
          {loading ? "Scanning fridge…" : "Find matching recipes"}
        </button>
      </div>
    </section>
  );
}
