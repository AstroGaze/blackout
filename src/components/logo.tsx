/** Blackout's mark: a tile with a bar blacked out across it, and the name. */
export function Logo() {
  return (
    <div className="flex items-center gap-2">
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="2" y="2" width="20" height="20" rx="5" fill="#fafafa" />
        <rect x="5" y="10" width="14" height="4" rx="1" fill="#FFB020" />
      </svg>
      <span className="text-base font-semibold tracking-tight">Blackout</span>
    </div>
  );
}
