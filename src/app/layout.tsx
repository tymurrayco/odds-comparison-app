// src/app/layout.tsx
import { ReactNode } from 'react';
import './globals.css';

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
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}