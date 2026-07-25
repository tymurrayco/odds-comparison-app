// src/components/Loading.tsx
// Branded loading states. Two pieces:
//   OddsLoader        — compact mark: "odds.day" with ticking line bars
//   GameCardSkeleton  — content-shaped shimmer standing in for a GameCard
//   FuturesSkeleton   — content-shaped shimmer standing in for a futures table
'use client';

// Three bars that pulse in sequence — reads as odds ticking / a line moving.
export function OddsTicks({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-end gap-[3px] h-4 ${className}`} aria-hidden="true">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="odds-tick-bar block w-[3px] h-full rounded-full bg-blue-500"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  );
}

// Compact branded loader for smaller regions / inline use.
export function OddsLoader({ label = 'Loading odds' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10" role="status" aria-live="polite">
      <div className="flex items-center">
        {/* no gap between the wordmark halves — they read as one word */}
        <span className="text-lg font-bold text-gray-900">odds</span>
        <span className="text-lg font-bold text-blue-600">.day</span>
        <OddsTicks className="ml-2" />
      </div>
      <span className="text-xs text-gray-400">{label}</span>
    </div>
  );
}

// Mirrors the real GameCard: header (teams + time), market buttons, odds rows.
export function GameCardSkeleton() {
  return (
    <div className="bg-white rounded-lg shadow-md mb-6 overflow-hidden">
      <div className="p-3 md:p-4 border-b border-gray-200">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex-1">
            <div className="skeleton h-5 w-56 sm:w-72" />
            <div className="flex items-center gap-2 mt-2">
              <div className="skeleton h-3 w-32" />
              <div className="skeleton h-3 w-24" />
            </div>
          </div>
          <div className="flex gap-2">
            <div className="skeleton h-7 w-16 rounded-md" />
            <div className="skeleton h-7 w-12 rounded-md" />
            <div className="skeleton h-7 w-12 rounded-md" />
          </div>
        </div>
      </div>
      <div className="px-2 md:px-4 py-3">
        {/* header row of book logos */}
        <div className="flex items-center gap-4 md:gap-8 pb-3 border-b border-gray-100">
          <div className="skeleton h-3 w-12" />
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} className="skeleton h-6 w-6 rounded-full" />
          ))}
        </div>
        {/* two team rows */}
        {[0, 1].map(row => (
          <div key={row} className="flex items-center gap-4 md:gap-8 py-3 border-b border-gray-100 last:border-0">
            <div className="flex items-center gap-2 w-12">
              <div className="skeleton h-5 w-5 rounded-full" />
            </div>
            {[0, 1, 2, 3, 4].map(i => (
              <div key={i} className="skeleton h-4 w-14" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function FuturesSkeleton() {
  return (
    <div className="bg-white rounded-lg shadow-md mb-6 overflow-hidden">
      <div className="p-3 md:p-4 border-b border-gray-200">
        <div className="skeleton h-5 w-48" />
      </div>
      <div className="px-2 md:px-4 py-3">
        <div className="flex items-center gap-6 md:gap-10 pb-3 border-b border-gray-100">
          <div className="skeleton h-3 w-12" />
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="skeleton h-6 w-6 rounded-full" />
          ))}
        </div>
        {[0, 1, 2, 3, 4, 5].map(row => (
          <div key={row} className="flex items-center gap-6 md:gap-10 py-3 border-b border-gray-100 last:border-0">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className="skeleton h-5 w-5 rounded-full shrink-0" />
              <div className="skeleton h-4 w-28 hidden sm:block" />
            </div>
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="skeleton h-4 w-12" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// Full-view loading: a couple of shaped skeletons under the branded mark.
export function BoardLoading({ variant = 'games' }: { variant?: 'games' | 'futures' }) {
  return (
    <div>
      <OddsLoader label={variant === 'futures' ? 'Loading futures' : 'Loading odds'} />
      {variant === 'futures' ? (
        <FuturesSkeleton />
      ) : (
        <>
          <GameCardSkeleton />
          <GameCardSkeleton />
        </>
      )}
    </div>
  );
}
