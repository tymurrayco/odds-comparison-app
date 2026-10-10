// src/app/layout.tsx
import { ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';
import { Inter_Tight } from 'next/font/google';
import SiteFooter from '@/components/SiteFooter';
import ThemeApplier from '@/components/ThemeApplier';
import './globals.css';

// Site font (design pass 2026-09-07, see DESIGN.md). Exposed as a CSS variable
// so globals.css owns the stack; Arial/Helvetica stay as the fallback.
const interTight = Inter_Tight({
  subsets: ['latin'],
  variable: '--font-inter-tight',
  display: 'swap',
});

const SITE_URL = 'https://www.odds.day';
const SITE_TITLE = 'odds.day - Find the Best Betting Odds';
const SITE_DESCRIPTION =
  'Compare live sports betting odds across DraftKings, FanDuel, BetMGM, Caesars, Kalshi and more. Best moneyline, spread and total prices for NFL, NBA, NCAAF, MLB, NHL and more.';

// Site-wide defaults. Pages with their own generateMetadata (game, bet,
// futures share pages) override title/description/openGraph; everything
// else inherits these so link previews never come up blank. No title
// template on purpose — those pages already append "| odds.day" themselves.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  applicationName: 'odds.day',
  icons: {
    icon: '/oddslogo.png',
    apple: '/oddslogo.png',
  },
  openGraph: {
    type: 'website',
    siteName: 'odds.day',
    url: SITE_URL,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [{ url: '/oddslogo.png', width: 1200, height: 1200, alt: 'odds.day' }],
  },
  twitter: {
    card: 'summary',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: ['/oddslogo.png'],
  },
  robots: {
    index: true,
    follow: true,
  },
};

// Light unless the account's Dark mode switch is on (globals.css sets
// color-scheme for that); OS dark mode alone never darkens the site.
export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#ffffff',
  width: 'device-width',
  initialScale: 1,
};

interface RootLayoutProps {
  children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    // suppressHydrationWarning: the script below may set data-theme before React loads
    <html lang="en" className={interTight.variable} suppressHydrationWarning>
      <head>
        {/* Dark mode chosen on an earlier visit: apply it before the first paint
            (ThemeApplier keeps the key in step with the account's setting) */}
        <script
          dangerouslySetInnerHTML={{
            __html: "try{if(localStorage.getItem('oddsdayTheme')==='dark')document.documentElement.dataset.theme='dark'}catch(e){}",
          }}
        />
      </head>
      <body>
        <ThemeApplier />
        {children}
        {/* Compliance footer on every page (21+, 1-800-GAMBLER, affiliate
            disclosure, Terms/Privacy). Share-preview pages (/game, /bet,
            /futures) redirect instantly, so it never shows there. */}
        <SiteFooter />
      </body>
    </html>
  );
}
