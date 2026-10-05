// src/app/terms/page.tsx — Terms of Use (PLACEHOLDER COPY — legal review pending)
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Terms of Use | odds.day',
  description: 'Terms of use for odds.day, a sports betting odds comparison site.',
};

const EFFECTIVE_DATE = 'October 4, 2026';

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-blue-50">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
        <Link href="/" className="text-sm text-blue-600 hover:underline">
          ← Back to odds
        </Link>

        <h1 className="mt-4 text-2xl font-bold tracking-tight text-gray-900">Terms of Use</h1>
        <p className="mt-1 text-sm text-gray-500">Effective {EFFECTIVE_DATE}</p>

        <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Draft. This page is placeholder text pending legal review and may change.
        </div>

        <div className="mt-6 space-y-6 text-[15px] leading-relaxed text-gray-800">
          <Section title="1. What odds.day is">
            <p>
              odds.day is an information service that compares publicly posted sports betting
              prices from licensed sportsbooks and prediction markets. odds.day is not a
              sportsbook. We do not accept, place, or settle wagers, and we do not hold any
              customer funds.
            </p>
          </Section>

          <Section title="2. Who may use the site">
            <p>
              You must be at least 21 years old, or the legal age for sports wagering where you
              live if that is higher, to use this site. Sports betting is not legal in every
              state. It is your responsibility to know and follow the laws that apply to you.
            </p>
          </Section>

          <Section title="3. Odds are informational and may be stale">
            <p>
              Prices shown on odds.day are collected from third-party data feeds and change
              constantly. A price shown here may differ from the price a sportsbook offers
              you at the moment you bet. Always confirm the line, price, and terms on the
              sportsbook before placing any wager. We make no guarantee that any price,
              projection, rating, or statistic on this site is accurate, complete, or current.
            </p>
          </Section>

          <Section title="4. Not advice">
            <p>
              Nothing on odds.day is betting, financial, or legal advice. Ratings, projections,
              edges, and model outputs are opinions produced by software. Any wager you place
              is your own decision and your own risk.
            </p>
          </Section>

          <Section title="5. Affiliate links">
            <p>
              Some links on odds.day lead to sportsbooks or prediction markets that may pay us a
              commission if you sign up or deposit through our link. This does not change the
              prices you see on those sites and does not influence which prices we show as the
              best available. See our affiliate disclosure in the site footer.
            </p>
          </Section>

          <Section title="6. Third-party sites">
            <p>
              When you leave odds.day, the other site&apos;s terms and privacy policy apply. We do
              not control those sites and are not responsible for their content, availability,
              or conduct.
            </p>
          </Section>

          <Section title="7. Acceptable use">
            <p>
              You may not scrape, copy, or redistribute data from odds.day in bulk, interfere
              with the site&apos;s operation, or use automated tools to access it beyond normal
              browsing.
            </p>
          </Section>

          <Section title="8. No warranty; limitation of liability">
            <p>
              The site is provided &quot;as is&quot; without warranties of any kind. To the fullest
              extent permitted by law, odds.day and its operator are not liable for any loss,
              including wagering losses, arising from your use of the site or reliance on any
              information on it.
            </p>
          </Section>

          <Section title="9. Changes">
            <p>
              We may update these terms at any time by posting a new version here. Continued use
              of the site after a change means you accept the new terms.
            </p>
          </Section>

          <Section title="10. Problem gambling help">
            <p>
              If gambling is causing you or someone you know a problem, call or text{' '}
              <a href="tel:1-800-426-2537" className="font-medium text-blue-600 hover:underline">
                1-800-GAMBLER
              </a>{' '}
              or visit{' '}
              <a
                href="https://www.ncpgambling.org/"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-blue-600 hover:underline"
              >
                ncpgambling.org
              </a>
              . Help is free and confidential.
            </p>
          </Section>

          <Section title="11. Contact">
            <p>Questions about these terms: [contact email — to be added].</p>
          </Section>
        </div>

        <p className="mt-10 text-sm text-gray-500">
          See also our <Link href="/privacy" className="text-blue-600 hover:underline">Privacy Policy</Link>.
        </p>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-base font-semibold text-gray-900">{title}</h2>
      <div className="mt-1.5 space-y-2">{children}</div>
    </section>
  );
}
