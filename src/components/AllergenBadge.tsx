import { useState } from "react";

type Props = {
  /** Allergens the meal contains (e.g. ["dairy", "gluten"]). */
  allergens: string[];
  /** User's own flagged allergens — if any overlap a red banner is shown. */
  userAllergens?: string[];
  /** When true the red-flag banner is hidden by default with a "Show anyway" toggle. */
  hideByDefault?: boolean;
};

/**
 * AllergenBadge — shown on every recipe/meal card throughout the app.
 *
 * Safety rule: always show allergen info, even when the user has no restrictions.
 */
export function AllergenBadge({ allergens, userAllergens = [], hideByDefault = true }: Props) {
  const [showAnyway, setShowAnyway] = useState(false);

  if (allergens.length === 0) return null;

  const flaggedByUser = allergens.filter((a) =>
    userAllergens.map((u) => u.toLowerCase()).includes(a.toLowerCase())
  );
  const hasFlaggedAllergen = flaggedByUser.length > 0;

  // If user has a flagged allergen and hideByDefault=true, collapse behind a toggle
  if (hasFlaggedAllergen && hideByDefault && !showAnyway) {
    return (
      <div className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-xs">
        <p className="font-semibold text-red-700">
          ⛔ This dish may not be safe for your dietary profile
        </p>
        <p className="mt-0.5 text-red-600">Contains: {flaggedByUser.join(", ")}</p>
        <button
          type="button"
          onClick={() => setShowAnyway(true)}
          className="mt-1 font-medium text-red-500 underline"
        >
          Show anyway
        </button>
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-1">
      {hasFlaggedAllergen && (
        <div className="rounded-xl bg-red-50 px-3 py-2 text-xs">
          <p className="font-semibold text-red-700">
            ⛔ This dish may not be safe for your dietary profile
          </p>
          <p className="mt-0.5 text-red-600">
            Flagged: {flaggedByUser.join(", ")}
          </p>
        </div>
      )}
      <p className="rounded-xl bg-amber-50 px-3 py-1.5 text-[11px] font-medium text-amber-700">
        ⚠️ Contains: {allergens.join(", ")} — check labels before cooking
      </p>
    </div>
  );
}
