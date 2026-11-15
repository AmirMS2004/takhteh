/**
 * The تخته mark: a navy board with three columns of cards; the yellow card is the work in progress.
 * Same drawing as src/app/icon.svg (the tab icon). See docs/BRAND.md.
 */
export function LogoMark({ size = 40 }: { size?: number }) {
  return (
    <svg aria-hidden viewBox="0 0 64 64" width={size} height={size} className="shrink-0">
      <rect x="4" y="4" width="56" height="56" rx="16" fill="#032147" />
      <rect x="43" y="15" width="12" height="11" rx="3" fill="#fff" />
      <rect x="43" y="29" width="12" height="11" rx="3" fill="#fff" fillOpacity=".5" />
      <rect x="43" y="43" width="12" height="7" rx="3" fill="#fff" fillOpacity=".25" />
      <rect x="26" y="15" width="12" height="11" rx="3" fill="#ecad0a" />
      <rect x="26" y="29" width="12" height="11" rx="3" fill="#fff" fillOpacity=".5" />
      <rect x="9" y="15" width="12" height="11" rx="3" fill="#fff" fillOpacity=".5" />
    </svg>
  );
}

export const BRAND = { name: "تخته", tagline: "همه کارها روی یک تخته" } as const;
