export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect
        x="1"
        y="1"
        width="30"
        height="30"
        rx="9"
        fill="var(--surface-2)"
        stroke="var(--line-strong)"
      />
      <path
        d="M7 22 13 15l4 3 8-9"
        stroke="var(--c-hold)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M7 24.5h18" stroke="var(--c-exchange)" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="25" cy="9" r="2.1" fill="var(--c-sell)" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark />
      <span className="display text-ink text-[1.15rem] leading-none">
        Hold<span className="text-[var(--c-hold)]">Sell</span>Swap
      </span>
    </span>
  );
}
