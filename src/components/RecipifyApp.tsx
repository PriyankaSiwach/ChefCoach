
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import type { DietFilter, Recipe, TimeFilter, UserProfile } from "@/types";
import { useFavourites } from "@/hooks/useFavourites";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { detectFridgeIngredients } from "@/lib/openai";
import { filterRecipeResults } from "@/lib/fridge-recipe-match";
import { fetchCookRecipesFromApi } from "@/lib/cook-recipes-api";
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
import type { AchievementUnlock } from "@/lib/gamification";
import {
  appendRecipeToDailyLog,
  dayHasMealLog,
  formatLocalDate,
  recordFridgeScan,
} from "@/lib/gamification";
import type { RecipeResultItem } from "@/types";
import { useToast } from "./Toast";
import { ScanCounter } from "./ScanCounter";
import { useAuth } from "@/contexts/AuthContext";
import {
  ensureProBypassForUser,
  isProSubscriptionActive,
  pullProfileFromSupabase,
  upsertProfileToSupabase,
} from "@/lib/profileSupabase";
import { verifySubscriptionOnLaunch } from "@/lib/iap";
import { redirectToLoginAfterAccountReset } from "@/lib/session";
import { PaywallScreen } from "./PaywallScreen";
import {
  isTrialExhausted,
  migrateTrialState,
  recordScanUsed,
  resolveAuthEmail,
  isProBypassEmail,
} from "@/lib/trial";
import {
  defaultUserProfile,
  readProfileFromStorage,
  RECIPIFY_PROFILE_STORAGE_KEY,
} from "@/lib/profileStorage";
import { isOnboardingCompleteOnDevice, markOnboardingCompleteOnDevice } from "@/lib/onboardingGate";
import { initReminderSync } from "@/lib/reminderNotifications";
import { DashboardScreen } from "./DashboardScreen";
import { DashboardEntryCard } from "./DashboardEntryCard";
import { FoodTrackerTab } from "./FoodTrackerTab";

const COOK_INITIAL_RECIPE_COUNT = 4;
const COOK_MORE_RECIPE_COUNT = 2;
const COOK_MAX_RECIPES = 6;

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
  /** True when the user chose manual ingredient entry instead of (or without) a photo. */
  const [manualEntryMode, setManualEntryMode] = useState(false);
  /** Cook tab: AI-generated recipes from scanned ingredients. */
  const [matchedRecipePool, setMatchedRecipePool] = useState<RecipeResultItem[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);

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
  const [activeTab, setActiveTab] = useState<"cook" | "tracker" | "saved" | "plan" | "profile">(
    "cook"
  );
  const { favourites, toggleFavourite, clearFavourites } = useFavourites();
  const showToast = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const clearedCheckoutCancelToast = useRef(false);

  const [celebrationQueue, setCelebrationQueue] = useState<AchievementUnlock[]>([]);

  const [gateChecked, setGateChecked] = useState(false);
  const { user, signOut, deleteAccount, isGuest, guestId } = useAuth();

  // Pro status is derived from the profile object (profile_data JSON in Supabase).
  // `isProSubscriptionActive` checks isPro flag AND subscription_expires_at.
  const authEmail = resolveAuthEmail(user);
  const trialBypass = isProBypassEmail(authEmail);
  const effectivePro = isProSubscriptionActive(profile) || trialBypass;

  /** Drives re-render of ScanCounter after each scan. */
  const [scanCountTick, setScanCountTick] = useState(0);
  /** Cook generate progress label for loading overlays. */
  const [loadingPhase, setLoadingPhase] = useState<"idle" | "scanning" | "generating">("idle");
  /** True when the full-screen paywall is open (4th scan intercepted). */
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [dashboardOpen, setDashboardOpen] = useState(false);
  const [profileMealNudge, setProfileMealNudge] = useState(false);
  const [profileSyncAttempted, setProfileSyncAttempted] = useState(false);

  const suppressNextPopRef = useRef(false);
  const dashboardHistoryPushedRef = useRef(false);
  const profileTabHistoryPushedRef = useRef(false);
  const dashboardOpenRef = useRef(false);
  const activeTabRef = useRef(activeTab);

  useEffect(() => {
    dashboardOpenRef.current = dashboardOpen;
  }, [dashboardOpen]);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  /** Keep cook as the history anchor so iOS swipe-back does not leave the app shell. */
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.history.state?.recipifyAppShell) {
      window.history.replaceState(
        { ...(window.history.state ?? {}), recipifyAppShell: true },
        ""
      );
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onPopState = () => {
      if (suppressNextPopRef.current) {
        suppressNextPopRef.current = false;
        return;
      }

      if (dashboardOpenRef.current) {
        setDashboardOpen(false);
        dashboardHistoryPushedRef.current = false;
        return;
      }

      if (activeTabRef.current === "profile") {
        profileTabHistoryPushedRef.current = false;
        setActiveTab("cook");
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }

      if (activeTabRef.current === "cook") {
        navigate("/", { replace: true });
      }
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [navigate]);

  const popHistoryEntry = useCallback(() => {
    suppressNextPopRef.current = true;
    window.history.back();
  }, []);

  const openDashboard = useCallback(() => {
    setDashboardOpen(true);
    window.history.pushState({ recipifyDashboard: true }, "");
    dashboardHistoryPushedRef.current = true;
  }, []);

  const closeDashboard = useCallback(() => {
    setDashboardOpen(false);
    if (dashboardHistoryPushedRef.current) {
      dashboardHistoryPushedRef.current = false;
      popHistoryEntry();
    }
  }, [popHistoryEntry]);

  const handleTabChange = useCallback(
    (tab: "cook" | "tracker" | "saved" | "plan" | "profile") => {
      if (dashboardHistoryPushedRef.current) {
        dashboardHistoryPushedRef.current = false;
        setDashboardOpen(false);
        popHistoryEntry();
      } else {
        setDashboardOpen(false);
      }

      if (
        activeTabRef.current === "profile" &&
        tab !== "profile" &&
        profileTabHistoryPushedRef.current
      ) {
        profileTabHistoryPushedRef.current = false;
        popHistoryEntry();
      } else if (tab === "profile" && activeTabRef.current !== "profile") {
        window.history.pushState({ recipifyProfileTab: true }, "");
        profileTabHistoryPushedRef.current = true;
      }

      setActiveTab(tab);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [popHistoryEntry]
  );

  // Boot: migrate legacy localStorage keys
  useEffect(() => {
    if (typeof window === "undefined") return;
    migrateTrialState();
    setGateChecked(true);
  }, []);

  // Onboarding is done but profile state is null — recover or pull from cloud.
  useEffect(() => {
    if (!profileReady || profile) {
      if (!user?.id) setProfileSyncAttempted(false);
      return;
    }
    if (!isOnboardingCompleteOnDevice()) return;

    const stored = readProfileFromStorage();
    if (stored) {
      setProfile(stored);
      return;
    }

    if (isGuest || !user?.id) {
      setProfile({ ...defaultUserProfile(), name: isGuest ? "Guest" : "" });
      return;
    }

    setProfileSyncAttempted(false);
    void pullProfileFromSupabase(user.id, resolveAuthEmail(user)).finally(() => {
      setProfileSyncAttempted(true);
    });
  }, [profileReady, profile, isGuest, user, setProfile]);

  // Meal / water / streak reminders (local notifications when enabled)
  useEffect(() => {
    if (typeof window === "undefined") return;
    return initReminderSync();
  }, []);

  // On login: verify subscription is still active against RevenueCat / local expiry
  useEffect(() => {
    if (!user?.id || !profileReady) return;
    void verifySubscriptionOnLaunch(user.id, profile, setProfile, authEmail);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, profileReady, authEmail]);

  // Lifetime Pro for support / owner accounts — apply immediately in UI + Supabase
  useEffect(() => {
    if (!user?.id || !profileReady || !trialBypass) return;
    void ensureProBypassForUser(user.id, authEmail);
    setProfile((prev) => {
      if (!prev || prev.isPro) return prev;
      return { ...prev, isPro: true, subscriptionExpiresAt: null };
    });
  }, [user?.id, profileReady, trialBypass, authEmail, setProfile]);

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

  // When subscription changes from another tab/context, resync local profile.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onSub = () => {
      try {
        const raw = window.localStorage.getItem(RECIPIFY_PROFILE_STORAGE_KEY);
        if (raw) setProfile(JSON.parse(raw) as typeof profile);
      } catch { /* ignore */ }
    };
    window.addEventListener("recipify-subscription-changed", onSub);
    return () => window.removeEventListener("recipify-subscription-changed", onSub);
  }, [setProfile]);

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

  const loadingMessage =
    loadingPhase === "generating"
      ? "Creating recipes…"
      : loadingPhase === "scanning"
        ? "Detecting ingredients…"
        : undefined;

  const onImageChange = (img: string | null) => {
    setCurrentImage(img);
    setMatchedRecipePool([]);
    setLoadingMore(false);
    setError(null);
    if (img) {
      setIngredients([]);
      setManualEntryMode(false);
      recordFridgeScan(img);
      return;
    }
    setIngredients([]);
  };

  /** Core generation logic. Accepts pre-parsed manual ingredients to avoid
   *  React state-timing issues when the caller commits ingredients and generates
   *  in the same event handler. */
  const onGenerate = async (preloadedIngredients?: string[]) => {
    const hasPhoto = Boolean(currentImage);
    const hasManual = (preloadedIngredients?.length ?? 0) > 0 || ingredients.length > 0;

    if (!hasPhoto && !hasManual) {
      // Nothing to work with — no-op (user hasn't provided a photo or any ingredients)
      return;
    }

    // ── Paywall gate: intercept before the 4th scan attempt ──────────────────
    if (!effectivePro && isTrialExhausted()) {
      setPaywallOpen(true);
      return;
    }

    setError(null);
    setLoading(true);
    const manualOnly =
      Boolean(preloadedIngredients?.length) ||
      (!currentImage && ingredients.length > 0);
    setLoadingPhase(manualOnly ? "generating" : "scanning");
    setMatchedRecipePool([]);

    try {
      // Use preloaded (manual) ingredients if provided, otherwise fall back to
      // state (already-detected) ingredients, then scan the photo if neither exists.
      let detectedIngredients = preloadedIngredients?.length
        ? preloadedIngredients
        : ingredients;

      if (!detectedIngredients.length && currentImage) {
        const base64 = currentImage.split(",")[1] ?? "";
        const mimeType = currentImage.split(";")[0]?.split(":")[1] || "image/jpeg";
        detectedIngredients = await detectFridgeIngredients(base64, mimeType, profile);
        if (!detectedIngredients.length) detectedIngredients = [...mockIngredients];
        setIngredients(detectedIngredients);
      } else if (preloadedIngredients?.length) {
        // Commit manual ingredients to state so the chip list is visible after results
        setIngredients(preloadedIngredients);
      }

      setLoadingPhase("generating");

      const aiRecipes = await fetchCookRecipesFromApi({
        ingredients: detectedIngredients,
        dietaryPreference: selectedDiet,
        maxCookTime: selectedTime,
        profile,
        count: COOK_INITIAL_RECIPE_COUNT,
      });
      setMatchedRecipePool(aiRecipes.slice(0, COOK_INITIAL_RECIPE_COUNT));

      // Consume one free scan (local + background Supabase sync)
      if (!effectivePro) {
        recordScanUsed(user?.id ?? null);
        setScanCountTick((t) => t + 1);
        // After the 3rd scan completes, proactively show paywall so user knows
        if (isTrialExhausted()) {
          setPaywallOpen(true);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
      setLoadingPhase("idle");
    }
  };

  /** Called by the manual-entry form — receives parsed ingredients directly to
   *  avoid React state-timing issues (setIngredients is async). */
  const onGenerateWithIngredients = (manualIngredients: string[]) => {
    void onGenerate(manualIngredients);
  };

  const onGenerateMore = async () => {
    if (!ingredients.length || matchedRecipePool.length >= COOK_MAX_RECIPES || loadingMore) {
      return;
    }

    setError(null);
    setLoadingMore(true);

    try {
      const additional = await fetchCookRecipesFromApi({
        ingredients,
        dietaryPreference: selectedDiet,
        maxCookTime: selectedTime,
        profile,
        count: COOK_MORE_RECIPE_COUNT,
        excludeTitles: matchedRecipePool.map((r) => r.name),
      });

      setMatchedRecipePool((prev) => {
        const seen = new Set(prev.map((r) => r.name.toLowerCase()));
        const unique = additional.filter((r) => !seen.has(r.name.toLowerCase()));
        return [...prev, ...unique].slice(0, COOK_MAX_RECIPES);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate more recipes.");
    } finally {
      setLoadingMore(false);
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

  const handleDeleteAccount = async (): Promise<{ ok: boolean; error?: string }> => {
    const result = await deleteAccount();
    if (!result.ok) {
      return result;
    }
    redirectToLoginAfterAccountReset();
    return { ok: true };
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

  /* Signed-in user — wait for cloud profile sync before onboarding vs main app. */
  if (user?.id && !isGuest && !profile && !profileSyncAttempted) {
    return <div className="min-h-screen bg-[var(--cream)]" aria-busy aria-label="Loading profile" />;
  }

  /* New or returning user without a profile — onboarding (includes re-signup after delete). */
  const needsProfileOnboarding =
    !shouldSkipOnboarding &&
    !profile &&
    (!isOnboardingCompleteOnDevice() || (user?.id && !isGuest && profileSyncAttempted));

  if (needsProfileOnboarding) {
    return (
      <OnboardingModal
        initialProfile={null}
        onComplete={(nextProfile) => {
          markOnboardingCompleteOnDevice();
          setProfile(nextProfile);
        }}
      />
    );
  }

  const trialExhausted = !effectivePro && isTrialExhausted();
  // Once all free scans are used, lock the displayed recipes (prompt upgrade)
  const recipesLocked = trialExhausted && recipes.length > 0;
  const showTrialEndedBanner = recipesLocked;
  const openPaywall = () => setPaywallOpen(true);

  const tabLabels = {
    cook: "Cook",
    tracker: "Track",
    saved: "Saved",
    plan: "Plan",
    profile: "Profile",
  } as const;

  return (
    <>
      <Header
        activeTab={activeTab}
        onTabChange={handleTabChange}
        favouritesCount={favourites.length}
        profileAvatarDataUri={profile?.avatarDataUri ?? undefined}
      />


      {activeTab === "cook" ? (
        <main className="tab-page w-full">
          <div style={{ animation: "fadeInDown 0.4s ease both" }}>
            <HeroSection />
          </div>

          <div
            className="app-shell relative z-20 -mt-6 space-y-3 px-4"
            style={{ animation: "fadeInUp 0.45s ease both", animationDelay: "0.05s" }}
          >
            {profile ? (
              <DashboardEntryCard profile={profile} onOpen={openDashboard} />
            ) : null}

            {!effectivePro ? (
              <ScanCounter tick={scanCountTick} onUpgrade={openPaywall} />
            ) : null}
          </div>

          <div style={{ animation: "fadeInUp 0.5s ease both", animationDelay: "0.12s" }}>
            <CameraUploadSection
              currentImage={currentImage}
              onImageChange={onImageChange}
              loading={loading}
              loadingMessage={loadingMessage}
              onAddManually={() => {
                setManualEntryMode(true);
                // Small delay so the ingredient section renders before scrolling
                setTimeout(() => {
                  document
                    .getElementById("ingredients-section")
                    ?.scrollIntoView({ behavior: "smooth", block: "start" });
                }, 100);
              }}
            />
          </div>

          <div style={{ animation: "fadeInUp 0.5s ease both", animationDelay: "0.18s" }}>
            <DietaryPreferencesSection
              selectedDiet={selectedDiet}
              onDietChange={setSelectedDiet}
            />
            <CookTimeFilterSection
              selectedTime={selectedTime}
              onTimeChange={setSelectedTime}
            />
          </div>

          <div id="ingredients-section" style={{ animation: "fadeInUp 0.5s ease both", animationDelay: "0.24s" }}>
            <RecipeResultsSection
              error={error}
              loading={loading}
              loadingMessage={loadingMessage}
              ingredients={ingredients}
              hasUploadedPhoto={Boolean(currentImage) || manualEntryMode}
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
              onGenerateMore={onGenerateMore}
              loadingMore={loadingMore}
              canGenerateMore={
                ingredients.length > 0 &&
                matchedRecipePool.length > 0 &&
                matchedRecipePool.length < COOK_MAX_RECIPES
              }
              onLogMeal={logMeal}
              onReset={() => {
                onImageChange(null);
                setError(null);
                setManualEntryMode(false);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              showTrialEndedBanner={showTrialEndedBanner}
              recipesLocked={recipesLocked}
              onUpgrade={openPaywall}
              manualMode={manualEntryMode}
              onGenerateWithIngredients={onGenerateWithIngredients}
            />
          </div>
        </main>
      ) : activeTab === "tracker" ? (
        <FoodTrackerTab profile={profile} />
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
          <section className="tab-page app-shell px-4 py-8">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--white)] p-5 text-center">
              <p className="text-sm text-[var(--gray)]">Loading your meal plan…</p>
            </div>
          </section>
        )
      ) : (
        profile ? (
          <ProfileTab
            profile={profile}
            userEmail={!isGuest ? resolveAuthEmail(user) : null}
            isPro={effectivePro}
            isGuest={isGuest}
            onEditProfile={() => {
              setEditProfileKey((k) => k + 1);
              setShowEditProfile(true);
            }}
            onOpenPaywall={openPaywall}
            onLogout={() => void handleLogout()}
            onDeleteAccount={() => handleDeleteAccount()}
          />
        ) : (
          <section className="tab-page app-shell px-4 py-8">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--white)] p-5 text-center">
              <p className="text-sm text-[var(--gray)]">Loading your profile…</p>
            </div>
          </section>
        )
      )}

      <footer className="hidden border-t border-[var(--border)] px-6 py-6 text-center text-xs text-[var(--gray)] md:block">
        ChefCoach — Made with care and your leftovers
      </footer>
      <BottomNavigation
        activeTab={activeTab}
        onTabChange={handleTabChange}
        showProfileMealNudge={profileMealNudge}
        profileAvatarDataUri={profile?.avatarDataUri ?? undefined}
      />
      <AchievementCelebration
        achievement={celebrationQueue[0] ?? null}
        onDismiss={() => setCelebrationQueue((q) => q.slice(1))}
      />
      {profile ? (
        <DashboardScreen
          open={dashboardOpen}
          profile={profile}
          backLabel={tabLabels[activeTab]}
          onClose={closeDashboard}
          onGoCook={() => {
            closeDashboard();
            handleTabChange("cook");
          }}
        />
      ) : null}
      <PaywallScreen
        open={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        onPurchaseSuccess={() => setPaywallOpen(false)}
        appUserId={user?.id ?? guestId ?? null}
        currentProfile={profile}
        setProfile={setProfile}
        isGuest={isGuest}
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
