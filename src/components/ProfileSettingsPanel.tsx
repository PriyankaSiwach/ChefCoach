import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { ReactNode } from "react";
import type { UserProfile } from "@/types";
import {
  areRemindersEnabled,
  toggleReminders,
} from "@/lib/reminderNotifications";
import {
  BellIcon,
  BugIcon,
  FileTextIcon,
  LockIcon,
  MessageIcon,
  StarIcon,
  TrashIcon,
  UserIcon,
} from "@/components/icons/AppIcons";
import { useToast } from "./Toast";

const SUPPORT_EMAIL = "support.chefcoach@gmail.com";

function ChevronRight() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 text-[var(--gray)] opacity-45"
      aria-hidden
    >
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

type SettingsRowProps = {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  onClick?: () => void;
  destructive?: boolean;
  disabled?: boolean;
};

function SettingsRow({
  icon,
  title,
  subtitle,
  onClick,
  destructive = false,
  disabled = false,
}: SettingsRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || !onClick}
      className={`flex w-full min-h-[48px] items-center gap-3 px-3.5 py-2.5 text-left transition active:bg-[var(--cream)] disabled:opacity-50 ${
        destructive ? "text-red-600" : "text-[var(--text)]"
      }`}
    >
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
          destructive ? "bg-red-50 text-red-600" : "bg-[var(--green-pale)] text-[var(--green)]"
        }`}
        aria-hidden
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-medium leading-tight">{title}</span>
        {subtitle ? (
          <span className="mt-0.5 block truncate text-[11px] text-[var(--gray)]">{subtitle}</span>
        ) : null}
      </span>
      {onClick ? <ChevronRight /> : null}
    </button>
  );
}

function SettingsSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-4">
      <h2 className="mb-1.5 px-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--gray)]">
        {title}
      </h2>
      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--white)] shadow-sm">
        {children}
      </div>
    </section>
  );
}

function SettingsDivider() {
  return <div className="mx-3.5 border-t border-[var(--border)]" aria-hidden />;
}

function SettingsToggleRow({
  icon,
  title,
  subtitle,
  enabled,
  busy,
  onToggle,
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  enabled: boolean;
  busy?: boolean;
  onToggle: (next: boolean) => void;
}) {
  return (
    <div className="flex min-h-[48px] items-center gap-3 px-3.5 py-2.5">
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--green-pale)] text-[var(--green)]"
        aria-hidden
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-medium leading-tight text-[var(--text)]">
          {title}
        </span>
        {subtitle ? (
          <span className="mt-0.5 block text-[11px] text-[var(--gray)]">{subtitle}</span>
        ) : null}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={title}
        disabled={busy}
        onClick={() => onToggle(!enabled)}
        className={`relative h-7 w-12 shrink-0 overflow-hidden rounded-full p-0.5 transition-colors duration-200 disabled:opacity-50 ${
          enabled ? "bg-[var(--green)]" : "bg-[var(--gray-light)]"
        }`}
      >
        <span
          className={`block h-6 w-6 rounded-full bg-white shadow-sm transition-transform duration-200 ease-out ${
            enabled ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}

type Props = {
  profile: UserProfile;
  isPro: boolean;
  dailyCalorieTarget: number;
  onEditProfile: () => void;
  onOpenPaywall: () => void;
  onLogout?: () => void | Promise<void>;
  onDeleteAccount: () => void;
  loggingOut?: boolean;
};

export function ProfileSettingsPanel({
  profile,
  isPro,
  dailyCalorieTarget,
  onEditProfile,
  onOpenPaywall,
  onLogout,
  onDeleteAccount,
  loggingOut = false,
}: Props) {
  const navigate = useNavigate();
  const showToast = useToast();
  const [remindersOn, setRemindersOn] = useState(() => areRemindersEnabled());
  const [remindersBusy, setRemindersBusy] = useState(false);

  useEffect(() => {
    const sync = () => setRemindersOn(areRemindersEnabled());
    window.addEventListener("chefcoach-reminders-changed", sync);
    return () => window.removeEventListener("chefcoach-reminders-changed", sync);
  }, []);

  const handleRemindersToggle = async (next: boolean) => {
    setRemindersBusy(true);
    try {
      const result = await toggleReminders(next);
      if (result.ok) {
        setRemindersOn(next);
        showToast(
          next
            ? "Reminders on — we’ll nudge you about meals, water & streaks 💚"
            : "Reminders turned off",
          "success"
        );
      } else {
        setRemindersOn(false);
        showToast(result.reason ?? "Could not enable reminders", "error");
      }
    } finally {
      setRemindersBusy(false);
    }
  };

  const openMail = (subject: string, body?: string) => {
    const params = new URLSearchParams({ subject });
    if (body) params.set("body", body);
    window.location.href = `mailto:${SUPPORT_EMAIL}?${params.toString()}`;
  };

  return (
    <div className="w-full">
      {/* ChefCoach Pro */}
      <div
        className={`mt-4 overflow-hidden rounded-xl border shadow-sm ${
          isPro
            ? "border-[var(--green)] bg-gradient-to-br from-[var(--green)] to-[var(--green-light)]"
            : "border-[var(--border)] bg-[var(--white)]"
        }`}
      >
        <div className={`p-4 ${isPro ? "text-white" : ""}`}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p
                className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${
                  isPro ? "text-white/80" : "text-[var(--gray)]"
                }`}
              >
                ChefCoach Pro
              </p>
              <p
                className={`mt-0.5 font-playfair text-xl ${
                  isPro ? "text-white" : "text-[var(--green)]"
                }`}
              >
                {isPro ? "Pro plan" : "Free plan"}
              </p>
              <p className={`mt-1 text-xs leading-snug ${isPro ? "text-white/85" : "text-[var(--gray)]"}`}>
                {isPro
                  ? "Unlimited scans & meal planning"
                  : "Upgrade for unlimited fridge scans"}
              </p>
            </div>
            <span
              className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                isPro ? "bg-white/20 text-white" : "bg-[var(--green-pale)] text-[var(--green)]"
              }`}
            >
              {isPro ? "Pro" : "Free"}
            </span>
          </div>
          {!isPro ? (
            <button
              type="button"
              onClick={onOpenPaywall}
              className="mt-3 w-full min-h-[44px] rounded-full bg-[var(--green)] py-2.5 text-sm font-semibold text-white shadow-sm transition active:scale-[0.98]"
            >
              Upgrade to Pro
            </button>
          ) : null}
        </div>
      </div>

      {/* Account */}
      <SettingsSection title="Account">
        <SettingsRow
          icon={<UserIcon className="h-4 w-4" />}
          title="Personal info"
          subtitle={`${profile.name || "Your profile"}, diet & ${dailyCalorieTarget.toLocaleString()} kcal goal`}
          onClick={onEditProfile}
        />
      </SettingsSection>

      {/* Subscription & payments */}
      <SettingsSection title="Subscription & payments">
        <SettingsRow
          icon={<StarIcon className="h-4 w-4" />}
          title="Subscription"
          subtitle={
            isPro
              ? "ChefCoach Pro — manage in App Store"
              : "Free plan — upgrade for unlimited scans"
          }
          onClick={() => {
            if (isPro) {
              showToast("Open Settings → Apple ID → Subscriptions on your iPhone", "info");
            } else {
              onOpenPaywall();
            }
          }}
        />
      </SettingsSection>

      {/* Reminders */}
      <SettingsSection title="Reminders">
        <SettingsToggleRow
          icon={<BellIcon className="h-4 w-4" />}
          title="Notifications"
          subtitle="Meals, water & streak reminders"
          enabled={remindersOn}
          busy={remindersBusy}
          onToggle={(next) => void handleRemindersToggle(next)}
        />
      </SettingsSection>

      {/* Help */}
      <SettingsSection title="Help">
        <SettingsRow
          icon={<MessageIcon className="h-4 w-4" />}
          title="Contact Support"
          subtitle={SUPPORT_EMAIL}
          onClick={() => openMail("ChefCoach Support")}
        />
        <SettingsDivider />
        <SettingsRow
          icon={<BugIcon className="h-4 w-4" />}
          title="Report a problem"
          subtitle="Send feedback or a bug report"
          onClick={() =>
            openMail("ChefCoach — Report a problem", "Describe what happened:\n\n")
          }
        />
      </SettingsSection>

      {/* Legal & privacy */}
      <SettingsSection title="Legal & privacy">
        <SettingsRow
          icon={<LockIcon className="h-4 w-4" />}
          title="Privacy Policy"
          subtitle="How we handle your data"
          onClick={() => navigate("/privacy")}
        />
        <SettingsDivider />
        <SettingsRow
          icon={<FileTextIcon className="h-4 w-4" />}
          title="Terms of Service"
          subtitle="Usage terms and conditions"
          onClick={() => navigate("/terms")}
        />
        <SettingsDivider />
        <SettingsRow
          icon={<TrashIcon className="h-4 w-4" />}
          title="Delete account"
          subtitle="Permanently remove your data"
          onClick={onDeleteAccount}
          destructive
        />
      </SettingsSection>

      {/* Log out */}
      {onLogout ? (
        <div className="mt-5 pb-4">
          <button
            type="button"
            disabled={loggingOut}
            onClick={() => {
              void Promise.resolve(onLogout());
            }}
            className="flex w-full min-h-[48px] items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--white)] py-3 text-sm font-semibold text-[var(--text)] shadow-sm transition active:bg-[var(--cream)] disabled:opacity-60"
          >
            {loggingOut ? "Logging out…" : "Log out"}
          </button>
        </div>
      ) : (
        <div className="pb-2" />
      )}
    </div>
  );
}
