// src/app/layout.tsx
import { ReactNode } from 'react';
import { Inter_Tight } from 'next/font/google';
import './globals.css';

// Site font (design pass 2026-09-07, see DESIGN.md). Exposed as a CSS variable
// so globals.css owns the stack; Arial/Helvetica stay as the fallback.
const interTight = Inter_Tight({
  subsets: ['latin'],
  variable: '--font-inter-tight',
  display: 'swap',
});

export const metadata = {
  title: 'odds.day - Find the Best Betting Odds',
  description: 'Compare sports betting odds across major bookmakers to find the best value',
  icons: {
    icon: '/oddslogo.png',
  }
};

interface RootLayoutProps {
  children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" className={interTight.variable}>
      <body>
        {children}
      </body>
    </html>
  );
}