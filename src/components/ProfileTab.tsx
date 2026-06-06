
import { useMemo, useState } from "react";
import { clearRecipifyLocalSession } from "@/lib/session";
import type { UserProfile } from "@/types";
import { ProfileSettingsPanel } from "./ProfileSettingsPanel";

type Props = {
  profile: UserProfile;
  userEmail?: string | null;
  isPro?: boolean;
  onEditProfile: () => void;
  onOpenPaywall?: () => void;
  onLogout?: () => void | Promise<void>;
  onDeleteRemoteProfile?: () => Promise<void>;
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
  const bmr =
    profile.sex === "male"
      ? 10 * profile.weightKg + 6.25 * profile.heightCm - 5 * profile.age + 5
      : profile.sex === "female"
        ? 10 * profile.weightKg + 6.25 * profile.heightCm - 5 * profile.age - 161
        : 10 * profile.weightKg + 6.25 * profile.heightCm - 5 * profile.age;

  let calories = Math.round(bmr * activityMult[profile.activityLevel]);
  if (profile.goal === "lose_weight") calories -= 300;
  if (profile.goal === "build_muscle") calories += 300;
  return calories;
}

export function ProfileTab({
  profile,
  userEmail,
  isPro = false,
  onEditProfile,
  onOpenPaywall,
  onLogout,
  onDeleteRemoteProfile,
}: Props) {
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

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
    <main className="min-h-full bg-[var(--cream)] pb-4">
      <div className="mx-auto w-full max-w-[430px] px-4 pt-5">
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
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[var(--green-pale)] text-2xl"
              aria-hidden
            >
              👤
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-playfair text-xl text-[var(--green)]">{displayName}</h1>
            {userEmail ? (
              <p className="truncate text-sm text-[var(--gray)]">{userEmail}</p>
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

        <ProfileSettingsPanel
          profile={profile}
          isPro={isPro}
          dailyCalorieTarget={dailyCalorieTarget}
          onEditProfile={onEditProfile}
          onOpenPaywall={() => onOpenPaywall?.()}
          onLogout={handleLogout}
          onDeleteAccount={() => setResetConfirmOpen(true)}
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
              Delete account?
            </p>
            <p className="mt-3 text-sm leading-relaxed text-[var(--gray)]">
              This permanently clears your local data and profile. This cannot be undone.
            </p>
            <div className="mt-6 flex gap-2">
              <button
                type="button"
                onClick={() => setResetConfirmOpen(false)}
                className="flex-1 rounded-full border border-[var(--border)] py-2.5 text-sm font-medium text-[var(--text)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  void (async () => {
                    try {
                      if (onDeleteRemoteProfile) await onDeleteRemoteProfile();
                    } catch {
                      /* ignore */
                    }
                    clearRecipifyLocalSession();
                    window.location.reload();
                  })();
                }}
                className="flex-1 rounded-full bg-red-600 py-2.5 text-sm font-semibold text-white"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
