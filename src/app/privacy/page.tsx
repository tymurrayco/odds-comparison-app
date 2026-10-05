// src/app/privacy/page.tsx — Privacy Policy (PLACEHOLDER COPY — legal review pending)
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy | odds.day',
  description: 'How odds.day collects and uses information.',
};

const EFFECTIVE_DATE = 'October 4, 2026';

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-blue-50">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
        <Link href="/" className="text-sm text-blue-600 hover:underline">
          ← Back to odds
        </Link>

        <h1 className="mt-4 text-2xl font-bold tracking-tight text-gray-900">Privacy Policy</h1>
        <p className="mt-1 text-sm text-gray-500">Effective {EFFECTIVE_DATE}</p>

        <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Draft. This page is placeholder text pending legal review and may change.
        </div>

        <div className="mt-6 space-y-6 text-[15px] leading-relaxed text-gray-800">
          <Section title="1. What we collect">
            <p>odds.day does not require an account. We collect:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <span className="font-medium">Click-out data.</span> When you click a sportsbook
                link we record which book, sport, game, and market you clicked, the time, the
                page you came from, your device type, and the state and country suggested by
                your IP address. We do not store your IP address itself.
              </li>
              <li>
                <span className="font-medium">Usage analytics.</span> Page views and basic
                interaction events, collected through a privacy-focused analytics service. We
                do not use this data to build advertising profiles.
              </li>
              <li>
                <span className="font-medium">Email address</span>, only if you choose to sign up
                for an email list. You can unsubscribe at any time using the link in any email.
              </li>
            </ul>
          </Section>

          <Section title="2. Browser storage">
            <p>
              We use your browser&apos;s local storage to remember preferences such as your
              chosen league, favorite teams, selected sportsbooks, and the state you entered for
              sportsbook deep links. This data stays on your device. We do not use advertising
              cookies.
            </p>
          </Section>

          <Section title="3. How we use information">
            <p>
              To run the site, understand which features and sportsbooks are useful, measure
              affiliate referrals, show you sportsbooks that operate in your state, and send
              emails you asked for. We do not sell personal information.
            </p>
          </Section>

          <Section title="4. Who we share it with">
            <p>
              Service providers that host and operate the site (such as our hosting, database,
              analytics, and email providers), who process data only on our behalf. When you
              click through to a sportsbook, that sportsbook may receive a referral identifier so
              it can credit the referral to odds.day; its own privacy policy then applies.
            </p>
          </Section>

          <Section title="5. Retention">
            <p>
              Click-out and analytics records are kept in aggregate form indefinitely and in raw
              form for no longer than needed to operate the site. Email addresses are kept until
              you unsubscribe.
            </p>
          </Section>

          <Section title="6. Your choices">
            <p>
              You can clear your browser&apos;s local storage at any time, unsubscribe from
              emails, and request deletion of any email address we hold by contacting us.
            </p>
          </Section>

          <Section title="7. Children">
            <p>
              odds.day is intended for adults 21 and older. We do not knowingly collect
              information from anyone under 21.
            </p>
          </Section>

          <Section title="8. Changes">
            <p>We may update this policy by posting a new version here with a new effective date.</p>
          </Section>

          <Section title="9. Contact">
            <p>Privacy questions: [contact email — to be added].</p>
          </Section>
        </div>

        <p className="mt-10 text-sm text-gray-500">
          See also our <Link href="/terms" className="text-blue-600 hover:underline">Terms of Use</Link>.
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
