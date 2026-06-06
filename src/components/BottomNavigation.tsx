
import type { ReactNode } from "react";

type Tab = "cook" | "saved" | "plan" | "profile";

type Props = {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  /** Orange nudge on Profile when past noon and no meals logged today */
  showProfileMealNudge?: boolean;
  profileAvatarDataUri?: string;
};

const tapClass =
  "flex flex-1 flex-col items-center justify-center gap-0.5 py-2 transition-transform duration-150 active:scale-90";

function NavIcon({ children }: { children: ReactNode }) {
  return (
    <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center text-[20px] leading-none">
      {children}
    </span>
  );
}

export function BottomNavigation({
  activeTab,
  onTabChange,
  showProfileMealNudge = false,
  profileAvatarDataUri,
}: Props) {
  const tabs: Tab[] = ["cook", "saved", "plan", "profile"];
  const activeIndex = Math.max(0, tabs.indexOf(activeTab));
  const indicatorWidth = 100 / tabs.length;

  const Item = ({
    tab,
    icon,
    label,
    nudge,
  }: {
    tab: Tab;
    icon: ReactNode;
    label: string;
    nudge?: boolean;
  }) => {
    const active = activeTab === tab;
    return (
      <button
        type="button"
        className={`${tapClass} ${active ? "text-[#2D5016]" : "text-[#9CA3AF]"}`}
        style={{ transition: "color 0.2s ease, transform 0.2s ease" }}
        onClick={() => onTabChange(tab)}
      >
        <span className="relative" style={{ transform: `scale(${active ? 1.1 : 1})`, transition: "transform 0.2s ease" }}>
          <NavIcon>{icon}</NavIcon>
          {nudge ? (
            <span
              className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-orange-500 ring-2 ring-white"
              aria-hidden
            />
          ) : null}
        </span>
        <span className="text-[11px] font-medium">{label}</span>
        <span
          className={`mt-0.5 h-1 w-1 rounded-full ${active ? "bg-[#2D5016]" : "bg-transparent"}`}
          aria-hidden
        />
      </button>
    );
  };

  return (
    <nav className="fixed inset-x-0 bottom-0 z-[58] border-t border-[var(--border)] bg-[var(--white)] pb-[max(0.25rem,env(safe-area-inset-bottom))] pt-0.5 md:hidden">
      <div className="relative mx-auto flex max-w-[600px]">
        <span
          className="pointer-events-none absolute bottom-0 h-[3px] rounded-full bg-[#2D5016]"
          style={{
            width: `${indicatorWidth}%`,
            transform: `translateX(${activeIndex * 100}%)`,
            transition: "transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
          aria-hidden
        />
        <Item tab="cook" icon={<span aria-hidden>🍳</span>} label="Cook" />
        <Item tab="saved" icon={<span aria-hidden>❤️</span>} label="Saved" />
        <Item tab="plan" icon={<span aria-hidden>📅</span>} label="Plan" />
        <Item
          tab="profile"
          icon={
            profileAvatarDataUri ? (
              <img
                src={profileAvatarDataUri}
                alt=""
                className="h-[22px] w-[22px] rounded-full border border-[var(--border)] object-cover"
              />
            ) : (
              <span aria-hidden>👤</span>
            )
          }
          label="Profile"
          nudge={showProfileMealNudge}
        />
      </div>
    </nav>
  );
}
