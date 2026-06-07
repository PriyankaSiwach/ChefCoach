
import { useState } from "react";
import { BrandLogo } from "@/components/BrandLogo";
import {
  CalendarIcon,
  ChefHatIcon,
  HeartIcon,
  IconLabel,
  UserIcon,
} from "@/components/icons/AppIcons";

type Props = {
  activeTab: "cook" | "saved" | "plan" | "profile";
  onTabChange: (tab: "cook" | "saved" | "plan" | "profile") => void;
  favouritesCount: number;
  /** Saved profile photo — shown on Profile nav control when set */
  profileAvatarDataUri?: string;
};

export function Header({
  activeTab,
  onTabChange,
  favouritesCount,
  profileAvatarDataUri,
}: Props) {
  const [openMobileMenu, setOpenMobileMenu] = useState(false);
  const base =
    "rounded-full px-4 py-2 text-xs md:text-sm transition bg-white/20 text-[var(--cream)]";
  const active = "bg-white/35";

  return (
    <>
      <header className="sticky top-0 z-50 w-full max-w-[100vw] overflow-x-clip bg-[var(--green)] pt-[env(safe-area-inset-top,0px)]">
        <div className="app-shell flex items-center justify-between px-4 py-3">
          <BrandLogo className="min-w-0 shrink-0" />
          <button
            type="button"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/35 text-[var(--cream)] md:hidden"
            aria-label="Open navigation menu"
            onClick={() => setOpenMobileMenu(true)}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
          <div className="hidden gap-2 md:flex">
          <button
            className={`${base} ${activeTab === "cook" ? active : ""}`}
            onClick={() => onTabChange("cook")}
          >
            <IconLabel icon={<ChefHatIcon />}>Cook</IconLabel>
          </button>
          <button
            className={`${base} ${activeTab === "saved" ? active : ""}`}
            onClick={() => onTabChange("saved")}
          >
            <IconLabel icon={<HeartIcon />}>Saved ({favouritesCount})</IconLabel>
          </button>
          <button
            className={`${base} ${activeTab === "plan" ? active : ""}`}
            onClick={() => onTabChange("plan")}
          >
            <IconLabel icon={<CalendarIcon />}>Plan</IconLabel>
          </button>
          <button
            className={`${base} flex items-center gap-2 ${activeTab === "profile" ? active : ""}`}
            onClick={() => onTabChange("profile")}
          >
            {profileAvatarDataUri ? (
              <img
                src={profileAvatarDataUri}
                alt=""
                className="h-7 w-7 shrink-0 rounded-full border border-white/40 object-cover"
              />
            ) : (
              <UserIcon className="h-5 w-5" aria-hidden />
            )}
            Profile
          </button>
        </div>
        </div>
      </header>

      {openMobileMenu ? (
        <div className="fixed inset-0 z-[70] bg-black/40 md:hidden" onClick={() => setOpenMobileMenu(false)}>
          <div
            className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-[var(--white)] p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-[var(--border)]" />
            <p className="mb-3 text-xs uppercase tracking-[0.14em] text-[var(--gray)]">Navigate</p>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => {
                  onTabChange("cook");
                  setOpenMobileMenu(false);
                }}
                className="w-full rounded-2xl border border-[var(--border)] px-4 py-3 text-left text-sm"
              >
                <IconLabel icon={<ChefHatIcon />}>Cook</IconLabel>
              </button>
              <button
                type="button"
                onClick={() => {
                  onTabChange("saved");
                  setOpenMobileMenu(false);
                }}
                className="w-full rounded-2xl border border-[var(--border)] px-4 py-3 text-left text-sm"
              >
                <IconLabel icon={<HeartIcon />}>Saved ({favouritesCount})</IconLabel>
              </button>
              <button
                type="button"
                onClick={() => {
                  onTabChange("plan");
                  setOpenMobileMenu(false);
                }}
                className="w-full rounded-2xl border border-[var(--border)] px-4 py-3 text-left text-sm"
              >
                <IconLabel icon={<CalendarIcon />}>Plan</IconLabel>
              </button>
              <button
                type="button"
                onClick={() => {
                  onTabChange("profile");
                  setOpenMobileMenu(false);
                }}
                className="flex w-full items-center gap-3 rounded-2xl border border-[var(--border)] px-4 py-3 text-left text-sm"
              >
                {profileAvatarDataUri ? (
                  <img
                    src={profileAvatarDataUri}
                    alt=""
                    className="h-9 w-9 shrink-0 rounded-full border border-[var(--border)] object-cover"
                  />
                ) : (
                  <UserIcon className="h-6 w-6" aria-hidden />
                )}
                Profile
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
