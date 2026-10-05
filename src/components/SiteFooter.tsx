// src/components/SiteFooter.tsx
//
// Site-wide compliance footer, rendered by the root layout under every page:
// 21+ notice, 1-800-GAMBLER, affiliate disclosure, Terms / Privacy links.
// Server component, no state. Copy is PLACEHOLDER pending legal review —
// edit the strings here, nothing else references them.
//
// Styling mirrors the board: white strip like the sticky header, the
// odds/.day wordmark with tight tracking, slate chips like the game-card
// badges, and the 11px gray-400 meta text the league nav uses for "Updated".

import Link from 'next/link';

const YEAR = new Date().getFullYear();

const chip =
  'inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold';

export default function SiteFooter() {
  return (
    <footer className="border-t border-gray-100 bg-white">
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        {/* Wordmark + the two things every page must carry */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[16px] font-bold tracking-[-0.3px]">
            <span className="text-blue-600">odds</span>
            <span className="text-gray-900">.day</span>
          </span>
          <span className={`${chip} text-gray-700`}>21+</span>
          <a href="tel:1-800-426-2537" className={`${chip} text-blue-600 hover:bg-blue-50`}>
            1-800-GAMBLER
          </a>
        </div>

        <div className="mt-3 space-y-1.5 text-[12px] leading-snug text-gray-500">
          <p>
            Gambling problem? Call or text 1-800-GAMBLER or visit{' '}
            <a
              href="https://www.ncpgambling.org/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              ncpgambling.org
            </a>
            . Must be 21+ (18+ where permitted) and in a state where sports betting is legal.
          </p>
          <p>
            <span className="font-semibold text-gray-700">Affiliate disclosure.</span> odds.day may
            earn a commission when you sign up or bet through links on this site. This does not change
            the prices shown or which price we mark as best.
          </p>
          <p>
            Odds are for information only and change constantly. Confirm the line and price on the
            sportsbook before you bet. odds.day is not a sportsbook and does not accept wagers.
          </p>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-400">
          <span>&copy; {YEAR} odds.day</span>
          <span aria-hidden="true">&middot;</span>
          <Link href="/terms" className="hover:text-gray-700 hover:underline">
            Terms
          </Link>
          <span aria-hidden="true">&middot;</span>
          <Link href="/privacy" className="hover:text-gray-700 hover:underline">
            Privacy
          </Link>
        </div>
      </div>
    </footer>
  );
}
