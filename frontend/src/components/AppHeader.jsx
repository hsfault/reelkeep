export function Wordmark() {
  return (
    <span className="flex items-center gap-2.5">
      <span className="grid size-8 place-items-center rounded-[9px] bg-ink">
        <span className="h-[15px] w-[9px] -rotate-12 rounded-[2px] bg-bg" />
      </span>
      <span className="font-display text-[19px] font-bold tracking-[-0.03em]">Reelkeep</span>
    </span>
  );
}

export default function AppHeader({ left, title, right }) {
  return (
    <header className="flex h-14 items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-1">
        {left}
        {title && (
          <h1 className="truncate font-display text-lg font-semibold tracking-tight">{title}</h1>
        )}
      </div>
      <div className="flex shrink-0 items-center">{right}</div>
    </header>
  );
}