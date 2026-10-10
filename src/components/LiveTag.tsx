// src/components/LiveTag.tsx
//
// The small "LIVE" mark beside a bet that was placed after its game started
// (Bet.live). One look everywhere it shows: the Bets list, card badges, the
// friends' list.

export default function LiveTag({ className = '' }: { className?: string }) {
  return (
    <span
      title="Placed live, after the game started"
      className={`inline-flex flex-none items-center gap-0.5 rounded bg-red-100 px-1 py-px text-[9px] font-bold uppercase leading-tight tracking-wide text-red-700 ${className}`}
    >
      <span className="h-1 w-1 rounded-full bg-red-500" />
      Live
    </span>
  );
}
