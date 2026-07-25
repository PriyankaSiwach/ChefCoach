import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { UserIcon } from "@/components/icons/AppIcons";
import type { UserProfile } from "@/types";
import { bodyMetricsForCalories } from "@/lib/profileStorage";
import { ProfileSettingsPanel } from "./ProfileSettingsPanel";

type Props = {
  profile: UserProfile;
  userEmail?: string | null;
  isPro?: boolean;
  isGuest?: boolean;
  onEditProfile: () => void;
  onOpenPaywall?: () => void;
  onLogout?: () => void | Promise<void>;
  onDeleteAccount?: () => void | Promise<{ ok: boolean; error?: string }>;
};

const activityMult: Record<UserProfile["activityLevel"], number> = {
  sedentary: 1.2,
  light: 1.375,
  gym_regular: 1.55,
  athlete: 1.725,
};

function capitalizeName(raw: string): string {
  const t = raw.trim();
  if (!t) return "Chef";
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function computeDailyCalorieTarget(profile: UserProfile): number {
  const { weightKg, heightCm, age, sex } = bodyMetricsForCalories(profile);
  const bmr =
    sex === "male"
      ? 10 * weightKg + 6.25 * heightCm - 5 * age + 5
      : sex === "female"
        ? 10 * weightKg + 6.25 * heightCm - 5 * age - 161
        : 10 * weightKg + 6.25 * heightCm - 5 * age;

  let calories = Math.round(bmr * activityMult[profile.activityLevel]);
  if (profile.goal === "lose_weight") calories -= 300;
  if (profile.goal === "build_muscle") calories += 300;
  return calories;
}

export function ProfileTab({
  profile,
  userEmail,
  isPro = false,
  isGuest = false,
  onEditProfile,
  onOpenPaywall,
  onLogout,
  onDeleteAccount,
}: Props) {
  const navigate = useNavigate();
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const displayName = capitalizeName(profile.name || "");
  const dailyCalorieTarget = useMemo(() => computeDailyCalorieTarget(profile), [profile]);

  const handleLogout = onLogout
    ? async () => {
        setLoggingOut(true);
        try {
          await Promise.resolve(onLogout());
        } finally {
          setLoggingOut(false);
        }
      }
    : undefined;

  return (
    <main className="tab-page min-h-full w-full max-w-[100vw] overflow-x-hidden bg-[var(--cream)]">
      <div className="app-shell px-4 pt-5">
        {/* Account header */}
        <header className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--white)] p-4 shadow-sm">
          {profile.avatarDataUri ? (
            <img
              src={profile.avatarDataUri}
              alt=""
              className="h-14 w-14 shrink-0 rounded-full border-2 border-[var(--green-pale)] object-cover"
            />
          ) : (
            <div
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[var(--green-pale)] text-[var(--green)]"
              aria-hidden
            >
              <UserIcon className="h-7 w-7" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="text-wrap-safe line-clamp-2 font-playfair text-xl leading-snug text-[var(--green)]">
              {displayName || "Chef"}
            </h1>
            {userEmail ? (
              <p className="text-wrap-safe break-all text-sm text-[var(--gray)]">{userEmail}</p>
            ) : (
              <p className="text-sm text-[var(--gray)]">Account settings</p>
            )}
          </div>
          <button
            type="button"
            onClick={onEditProfile}
            className="shrink-0 rounded-full border border-[var(--green)] bg-[var(--green-pale)] px-3 py-2 text-xs font-semibold text-[var(--green)]"
          >
            Edit
          </button>
        </header>

        {isGuest && (
          <div className="mt-4 rounded-2xl border border-[var(--green)]/30 bg-[var(--green-pale)] px-4 py-3">
            <p className="text-sm font-semibold text-[var(--green)]">You're browsing as a Guest</p>
            <p className="mt-0.5 text-xs text-[var(--gray)]">
              Create a free account to save your recipes and sync across devices.
            </p>
            <button
              type="button"
              onClick={() => navigate("/login", { replace: true })}
              className="mt-3 w-full rounded-full bg-[var(--green)] py-2 text-sm font-semibold text-white"
            >
              Sign in or create account
            </button>
            <button
              type="button"
              onClick={() => void handleLogout?.()}
              className="mt-2 w-full rounded-full border border-[var(--border)] py-2 text-sm text-[var(--gray)]"
            >
              Exit guest mode
            </button>
          </div>
        )}

        <ProfileSettingsPanel
          profile={profile}
          isPro={isPro}
          dailyCalorieTarget={dailyCalorieTarget}
          onEditProfile={onEditProfile}
          onOpenPaywall={() => onOpenPaywall?.()}
          onLogout={handleLogout}
          onDeleteAccount={() => {
            setDeleteError(null);
            setResetConfirmOpen(true);
          }}
          loggingOut={loggingOut}
        />
      </div>

      {resetConfirmOpen ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4"
          role="dialog"
          aria-modal
          aria-labelledby="delete-account-title"
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <p id="delete-account-title" className="font-playfair text-lg text-[var(--green)]">
              Delete your account?
            </p>
            <p className="mt-3 text-sm leading-relaxed text-[var(--gray)]">
              This will permanently delete your account, remove all your data from our servers,
              and sign you out. You will need to create a new account to use ChefCoach again.
              This cannot be undone.
            </p>
            <p className="mt-2 text-sm font-medium text-[var(--text)]">
              Are you sure you want to do that?
            </p>
            {deleteError ? (
              <p className="mt-3 text-sm text-red-600" role="alert">
                {deleteError}
              </p>
            ) : null}
            <div className="mt-6 flex gap-2">
              <button
                type="button"
                disabled={deletingAccount}
                onClick={() => {
                  setResetConfirmOpen(false);
                  setDeleteError(null);
                }}
                className="flex-1 rounded-full border border-[var(--border)] py-2.5 text-sm font-medium text-[var(--text)] disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deletingAccount}
                onClick={() => {
                  void (async () => {
                    if (!onDeleteAccount) return;
                    setDeletingAccount(true);
                    setDeleteError(null);
                    try {
                      const result = await Promise.resolve(onDeleteAccount());
                      if (result && !result.ok) {
                        setDeleteError(result.error ?? "Could not delete your account. Try again.");
                      }
                    } catch {
                      setDeleteError("Could not delete your account. Try again.");
                    } finally {
                      setDeletingAccount(false);
                    }
                  })();
                }}
                className="flex-1 rounded-full bg-red-600 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {deletingAccount ? "Deleting…" : "Yes, delete my account"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
