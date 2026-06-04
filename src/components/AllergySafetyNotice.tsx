/** App Store / health guideline reminder shown next to allergy selections. */
export function AllergySafetyNotice() {
  return (
    <p className="mb-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-amber-900">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        width={14}
        height={14}
        className="mt-0.5 shrink-0 text-amber-600"
        aria-hidden
      >
        <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      </svg>
      <span>
        <span className="font-medium">Always check ingredient labels</span> — recipes and
        products can change without notice.
      </span>
    </p>
  );
}
