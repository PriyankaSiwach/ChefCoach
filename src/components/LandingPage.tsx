
type Props = {
  onTryForFree: () => void;
};

export function LandingPage({ onTryForFree }: Props) {
  return (
    <main className="min-h-screen bg-[var(--cream)] px-6 py-10">
      <section className="mx-auto flex min-h-[80vh] w-full max-w-[940px] flex-col justify-center rounded-3xl bg-gradient-to-br from-[var(--green)] to-[var(--green-light)] p-8 text-[var(--cream)] shadow-xl md:p-12">
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--cream)]/80">
          Recipify
        </p>
        <h1 className="mt-4 font-playfair text-5xl leading-tight md:text-6xl">
          Your personal nutrition coach.
        </h1>
        <p className="mt-4 max-w-[620px] text-sm text-[var(--cream)]/90 md:text-base">
          Turn fridge ingredients into meals tailored to your goals, macros, and
          lifestyle in under a minute.
        </p>
        <div className="mt-8 flex flex-wrap gap-3 text-sm">
          <span className="rounded-full bg-white/15 px-4 py-2">🧠 Smart recipes</span>
          <span className="rounded-full bg-white/15 px-4 py-2">📊 Macro tracking</span>
          <span className="rounded-full bg-white/15 px-4 py-2">💬 Diet coach</span>
        </div>
        <div className="mt-10">
          <button
            type="button"
            onClick={onTryForFree}
            className="rounded-full bg-[var(--cream)] px-7 py-3 text-sm font-semibold text-[var(--green)] transition hover:translate-y-[-1px]"
            aria-label="Try for free and start onboarding"
          >
            Try for Free
          </button>
        </div>
      </section>
    </main>
  );
}
