// src/components/SiteFooter.tsx
//
// Site-wide compliance footer, rendered by the root layout under every page:
// 21+ notice, 1-800-GAMBLER, affiliate disclosure, Terms / Privacy links.
// Server component, no state. Copy is PLACEHOLDER pending legal review —
// edit the strings here, nothing else references them.

import Link from 'next/link';

const YEAR = new Date().getFullYear();

export default function SiteFooter() {
  return (
    <footer className="border-t border-gray-200 bg-white">
      <div className="mx-auto max-w-5xl px-4 py-6 text-xs leading-relaxed text-gray-500">
        {/* Responsible gambling */}
        <p className="font-medium text-gray-700">
          21+ (18+ where permitted). Gambling problem? Call or text{' '}
          <a href="tel:1-800-426-2537" className="font-semibold text-blue-600 hover:underline">
            1-800-GAMBLER
          </a>
          .{' '}
          <a
            href="https://www.ncpgambling.org/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
          >
            ncpgambling.org
          </a>
        </p>

        {/* Affiliate disclosure */}
        <p className="mt-2">
          <span className="font-medium text-gray-600">Affiliate disclosure:</span> odds.day may earn a
          commission when you sign up or bet through links on this site. This does not change the
          prices shown or which price we mark as best.
        </p>

        {/* Data + not-a-book */}
        <p className="mt-2">
          Odds are for information only and change constantly. Confirm the line and price on the
          sportsbook before you bet. odds.day is not a sportsbook and does not accept wagers. Sports
          betting is not legal in every state; know the rules where you are.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1">
          <span>&copy; {YEAR} odds.day</span>
          <Link href="/terms" className="hover:text-gray-900 hover:underline">
            Terms
          </Link>
          <Link href="/privacy" className="hover:text-gray-900 hover:underline">
            Privacy
          </Link>
        </div>
      </div>
    </footer>
  );
}
