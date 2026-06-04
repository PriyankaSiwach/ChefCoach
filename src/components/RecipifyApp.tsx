
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import type { DietFilter, Recipe, TimeFilter, UserProfile } from "@/types";
import { useFavourites } from "@/hooks/useFavourites";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { detectFridgeIngredients } from "@/lib/openai";
import { filterRecipeResults, matchRecipesFromIngredients } from "@/lib/fridge-recipe-match";
import { BottomNavigation } from "./BottomNavigation";
import { CameraUploadSection } from "./CameraUploadSection";
import { CookTimeFilterSection } from "./CookTimeFilterSection";
import { DietaryPreferencesSection } from "./DietaryPreferencesSection";
import { Header } from "./Header";
import { HeroSection } from "./HeroSection";
import { EditProfileScreen } from "./EditProfileScreen";
import { OnboardingModal } from "./OnboardingModal";
import { PlanTab } from "./PlanTab";
import { ProfileTab } from "./ProfileTab";
import { RecipeResultsSection } from "./RecipeResultsSection";
import { SavedRecipesSection } from "./SavedRecipesSection";
import { AchievementCelebration } from "./AchievementCelebration";
import { ChatBot } from "./ChatBot";
import type { AchievementUnlock } from "@/lib/gamification";
import {
  appendRecipeToDailyLog,
  dayHasMealLog,
  formatLocalDate,
  recordFridgeScan,
} from "@/lib/gamification";
import type { RecipeResultItem } from "@/types";
import { useToast } from "./Toast";
import { TrialCookBanner } from "./TrialCookBanner";
import { useAuth } from "@/contexts/AuthContext";
import { deleteRemoteProfile, upsertProfileToSupabase } from "@/lib/profileSupabase";
import { UpgradeModal } from "./UpgradeModal";
import {
  consumeTrialScan,
  getTrialEnded,
  getTrialScansRemaining,
  isTrialScanBypassActive,
  migrateTrialState,
  setTrialEnded as persistTrialEnded,
} from "@/lib/trial";
import { RECIPIFY_PROFILE_STORAGE_KEY } from "@/lib/profileStorage";
export function RecipifyApp() {
  const mockIngredients = [
    "eggs",
    "spinach",
    "tomato",
    "chicken breast",
    "yogurt",
    "rice",
  ];
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const [selectedDiet, setSelectedDiet] = useState<DietFilter>("None");
  const [selectedTime, setSelectedTime] = useState<TimeFilter>("any");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ingredients, setIngredients] = useState<string[]>([]);
  /** Cook tab: hardcoded meal library matches (after vision scan). */
  const [matchedRecipePool, setMatchedRecipePool] = useState<RecipeResultItem[]>([]);

  const recipes = useMemo(
    () => filterRecipeResults(matchedRecipePool, selectedDiet, selectedTime),
    [matchedRecipePool, selectedDiet, selectedTime]
  );
  const [profile, setProfile, profileReady] = useLocalStorage<UserProfile | null>(
    RECIPIFY_PROFILE_STORAGE_KEY,
    null
  );
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [editProfileKey, setEditProfileKey] = useState(0);
  const [activeTab, setActiveTab] = useState<"cook" | "saved" | "plan" | "profile">(
    "cook"
  );
  const { favourites, toggleFavourite, clearFavourites } = useFavourites();
  const showToast = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const clearedCheckoutCancelToast = useRef(false);

  const [celebrationQueue, setCelebrationQueue] = useState<AchievementUnlock[]>([]);

  const [gateChecked, setGateChecked] = useState(false);
  const { user, signOut } = useAuth();
  const [trialEnded, setTrialEnded] = useState(false);
  const [isPro, setIsPro] = useState(false);
  const trialBypass = useMemo(
    () => isTrialScanBypassActive(user?.email ?? undefined),
    [user?.email]
  );
  const effectivePro = isPro || trialBypass;
  const [graceAfterThirdScan, setGraceAfterThirdScan] = useState(false);
  const [trialUiTick, setTrialUiTick] = useState(0);
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [profileMealNudge, setProfileMealNudge] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const pro = window.localStorage.getItem("recipify_is_pro") === "true";
      setIsPro(pro);
      migrateTrialState();
      setTrialEnded(getTrialEnded());
      const remindTomorrow = window.localStorage.getItem("recipify_remind_tomorrow");
      const today = new Date().toISOString().slice(0, 10);
      if (!pro && remindTomorrow === today) {
        setUpgradeModalOpen(true);
      }
    } catch {
      /* ignore */
    }
    setGateChecked(true);
  }, []);

  useEffect(() => {
    if (!user?.id || !profileReady || profile === null) return;
    const t = window.setTimeout(() => {
      void upsertProfileToSupabase(user.id, profile).then(({ error }) => {
        if (error) console.warn("Profile sync:", error);
      });
    }, 800);
    return () => window.clearTimeout(t);
  }, [profile, profileReady, user?.id]);

  useEffect(() => {
    if (!gateChecked || clearedCheckoutCancelToast.current) return;
    if (searchParams.get("cancelled") === "true") {
      clearedCheckoutCancelToast.current = true;
      showToast("No worries! You still have your 3 free scans.", "info");
      const next = new URLSearchParams(searchParams);
      next.delete("cancelled");
      setSearchParams(next, { replace: true });
    }
  }, [gateChecked, searchParams, setSearchParams, showToast]);

  useEffect(() => {
    if (typeof window === "undefined" || !gateChecked) return;
    setTrialEnded(getTrialEnded());
  }, [gateChecked, trialUiTick, user?.email]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onSub = () => {
      try {
        setIsPro(window.localStorage.getItem("recipify_is_pro") === "true");
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("recipify-subscription-changed", onSub);
    return () => window.removeEventListener("recipify-subscription-changed", onSub);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const update = () => {
      const h = new Date().getHours();
      const today = formatLocalDate(new Date());
      setProfileMealNudge(h >= 12 && !dayHasMealLog(today));
    };
    update();
    window.addEventListener("meal-logged", update);
    window.addEventListener("recipify-stats-changed", update);
    return () => {
      window.removeEventListener("meal-logged", update);
      window.removeEventListener("recipify-stats-changed", update);
    };
  }, []);

  const shouldSkipOnboarding = import.meta.env.VITE_SKIP_ONBOARDING === "true";

  useEffect(() => {
    const onAchievements = (e: Event) => {
      const detail = (e as CustomEvent<AchievementUnlock[]>).detail;
      if (detail?.length) setCelebrationQueue((q) => [...q, ...detail]);
    };
    window.addEventListener("recipify-achievements", onAchievements);
    return () => window.removeEventListener("recipify-achievements", onAchievements);
  }, []);

  const onImageChange = (img: string | null) => {
    setCurrentImage(img);
    setMatchedRecipePool([]);
    setError(null);
    if (img) {
      setIngredients([]);
      recordFridgeScan(img);
      return;
    }
    setIngredients([]);
  };

  const onGenerate = async () => {
    if (!currentImage) {
      setError("Please upload a photo of your fridge first.");
      return;
    }

    setError(null);
    setLoading(true);
    setMatchedRecipePool([]);

    try {
      const base64 = currentImage.split(",")[1] ?? "";
      const mimeType =
        currentImage.split(";")[0]?.split(":")[1] || "image/jpeg";
      let detectedIngredients = await detectFridgeIngredients(
        base64,
        mimeType,
        profile
      );
      if (!detectedIngredients.length) {
        detectedIngredients = [...mockIngredients];
      }
      setIngredients(detectedIngredients);

      // Only OpenAI call: ingredient vision. Recipes come from the hardcoded meal library.
      const matched = matchRecipesFromIngredients(detectedIngredients, profile);
      setMatchedRecipePool(matched);

      if (!effectivePro) {
        const beforeRemaining = getTrialScansRemaining();
        const afterRemaining = consumeTrialScan();
        setTrialUiTick((t) => t + 1);
        if (afterRemaining === 0 && beforeRemaining > 0 && !getTrialEnded()) {
          setGraceAfterThirdScan(true);
          setUpgradeModalOpen(true);
          window.setTimeout(() => {
            persistTrialEnded(true);
            setTrialEnded(true);
            setGraceAfterThirdScan(false);
            setTrialUiTick((t) => t + 1);
          }, 2000);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut();
      showToast("Logged out", "info");
    } catch (e) {
      console.warn("[Auth] Logout:", e);
      showToast("Could not sign out fully — try again", "info");
    } finally {
      navigate("/login", { replace: true });
    }
  };

  const logMeal = (recipe: Recipe) => {
    appendRecipeToDailyLog(recipe, profile);
    showToast(`Meal logged! ${recipe.calories} kcal added`, "success");
  };

  const handleToggleFavourite = (recipe: Recipe) => {
    const wasSaved = favourites.some((item) => item.name === recipe.name);
    toggleFavourite(recipe);
    showToast(
      wasSaved
        ? `Removed “${recipe.name}” from your saved list`
        : `Saved “${recipe.name}” — find it under Saved`,
      wasSaved ? "info" : "success"
    );
  };

  if (!gateChecked) {
    return <div className="min-h-screen bg-[var(--cream)]" aria-busy />;
  }

  // First-time flow: Email → Onboarding ("tell us about yourself") → Dashboard (Cook)
  /* Wait for recipifyProfile from localStorage — avoids showing onboarding to returning users before hydrate */
  if (!profileReady) {
    return <div className="min-h-screen bg-[var(--cream)]" aria-busy />;
  }

  /* Full onboarding only when no saved profile (first-time); returning users always have profile after hydrate */
  if (!shouldSkipOnboarding && !profile) {
    return (
      <OnboardingModal
        initialProfile={profile}
        onComplete={(nextProfile) => {
          setProfile(nextProfile);
        }}
      />
    );
  }

  const recipesLocked =
    !effectivePro && recipes.length > 0 && trialEnded && !graceAfterThirdScan;
  const showTrialEndedBanner =
    !effectivePro && recipes.length > 0 && trialEnded && !graceAfterThirdScan;
  const openUpgrade = () => setUpgradeModalOpen(true);

  return (
    <>
      <Header
        activeTab={activeTab}
        onTabChange={setActiveTab}
        favouritesCount={favourites.length}
        profileAvatarDataUri={profile?.avatarDataUri ?? undefined}
      />

      {activeTab === "cook" && !effectivePro ? (
        <TrialCookBanner
          scansRemaining={getTrialScansRemaining()}
          trialEnded={trialEnded}
          onUpgrade={openUpgrade}
        />
      ) : null}

      {activeTab === "cook" ? (
        <main className="pb-[calc(5rem+env(safe-area-inset-bottom,0px))]">
          <div style={{ animation: "fadeInDown 0.4s ease both" }}>
            <HeroSection />
          </div>
          <div style={{ animation: "fadeInUp 0.5s ease both", animationDelay: "0.1s" }}>
            <CameraUploadSection
              currentImage={currentImage}
              onImageChange={onImageChange}
              loading={loading}
            />
          </div>

          <div style={{ animation: "fadeInUp 0.5s ease both", animationDelay: "0.2s" }}>
            <DietaryPreferencesSection
              selectedDiet={selectedDiet}
              onDietChange={setSelectedDiet}
            />
            <CookTimeFilterSection
              selectedTime={selectedTime}
              onTimeChange={setSelectedTime}
            />
          </div>

          <div style={{ animation: "fadeInUp 0.5s ease both", animationDelay: "0.3s" }}>
            <RecipeResultsSection
              error={error}
              loading={loading}
              ingredients={ingredients}
              hasUploadedPhoto={Boolean(currentImage)}
              recipes={recipes}
              matchedRecipePoolCount={matchedRecipePool.length}
              favourites={favourites}
              profile={profile}
              onToggleFavourite={handleToggleFavourite}
              onRemoveIngredient={(ingredient) =>
                setIngredients((prev) => prev.filter((i) => i !== ingredient))
              }
              onAddIngredient={(ingredient) =>
                setIngredients((prev) => {
                  const value = ingredient.trim().toLowerCase();
                  if (!value || prev.some((i) => i.toLowerCase() === value)) return prev;
                  return [...prev, value];
                })
              }
              onGenerateRecipes={onGenerate}
              onLogMeal={logMeal}
              onReset={() => {
                onImageChange(null);
                setError(null);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              showTrialEndedBanner={showTrialEndedBanner}
              recipesLocked={recipesLocked}
              onUpgrade={openUpgrade}
            />
          </div>
        </main>
      ) : activeTab === "saved" ? (
        <SavedRecipesSection
          favourites={favourites}
          onToggleFavourite={handleToggleFavourite}
          profile={profile}
          onGoCook={() => setActiveTab("cook")}
        />
      ) : activeTab === "plan" ? (
        profile ? (
          <PlanTab
            profile={profile}
            onUpdateProfile={(next) => setProfile(next)}
            favourites={favourites}
            lastScanIngredients={ingredients}
            onGoCook={() => {
              setActiveTab("cook");
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          />
        ) : (
          <section className="mx-auto max-w-[920px] px-5 py-8 pb-24">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--white)] p-5">
              <h2 className="font-playfair text-2xl text-[var(--green)]">Profile needed</h2>
              <p className="mt-2 text-sm text-[var(--gray)]">
                Complete onboarding to use meal planning and pantry tools.
              </p>
              <button
                type="button"
                className="mt-4 rounded-full bg-[var(--green)] px-4 py-2 text-sm text-white"
                onClick={() => setShowOnboarding(true)}
              >
                Continue onboarding
              </button>
            </div>
          </section>
        )
      ) : (
        profile ? (
          <ProfileTab
            profile={profile}
            onEditProfile={() => {
              setEditProfileKey((k) => k + 1);
              setShowEditProfile(true);
            }}
            onGoToCook={() => {
              setActiveTab("cook");
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            onLogout={() => void handleLogout()}
            onDeleteRemoteProfile={
              user?.id ? async () => deleteRemoteProfile(user.id) : undefined
            }
          />
        ) : (
          <section className="mx-auto max-w-[920px] px-5 py-8 pb-24">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--white)] p-5">
              <h2 className="font-playfair text-2xl text-[var(--green)]">Profile setup needed</h2>
              <p className="mt-2 text-sm text-[var(--gray)]">
                Complete onboarding to unlock your personalized targets and meal plan.
              </p>
              <button
                type="button"
                className="mt-4 rounded-full bg-[var(--green)] px-4 py-2 text-sm text-white"
                onClick={() => setShowOnboarding(true)}
              >
                Continue onboarding
              </button>
            </div>
          </section>
        )
      )}

      <footer className="border-t border-[var(--border)] px-6 py-6 pb-[calc(5rem+env(safe-area-inset-bottom,0px))] text-center text-xs text-[var(--gray)] md:pb-6">
        ChefCoach — Made with ❤️ and your leftovers
      </footer>
      <BottomNavigation
        activeTab={activeTab}
        onTabChange={setActiveTab}
        showProfileMealNudge={profileMealNudge}
        profileAvatarDataUri={profile?.avatarDataUri ?? undefined}
      />
      <AchievementCelebration
        achievement={celebrationQueue[0] ?? null}
        onDismiss={() => setCelebrationQueue((q) => q.slice(1))}
      />
      <ChatBot />
      <UpgradeModal
        open={upgradeModalOpen}
        onClose={() => setUpgradeModalOpen(false)}
        appUserId={user?.id ?? null}
      />
      {showEditProfile && profile ? (
        <EditProfileScreen
          key={editProfileKey}
          profile={profile}
          onClose={() => setShowEditProfile(false)}
          onSave={(nextProfile) => {
            setProfile(nextProfile);
          }}
        />
      ) : null}
      {showOnboarding ? (
        <OnboardingModal
          initialProfile={profile}
          onComplete={(nextProfile) => {
            setProfile(nextProfile);
            setShowOnboarding(false);
          }}
        />
      ) : null}
    </>
  );
}
