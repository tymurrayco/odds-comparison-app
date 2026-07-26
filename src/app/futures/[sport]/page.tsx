// src/app/futures/[sport]/page.tsx
// Shareable futures link: serves an OG card of the market's top favorites,
// then redirects into the futures view on the main page.
import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import {
  MARKET_TITLES, getTopFutures, attachEspnAssets,
} from '@/lib/futuresShare';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ sport: string }>;
}): Promise<Metadata> {
  const { sport } = await params;
  const title = MARKET_TITLES[sport];
  if (!title) {
    return { title: 'Futures | odds.day', description: 'Championship futures odds comparison.' };
  }

  const all = await getTopFutures(sport);
  const top = all.slice(0, 5);
  await attachEspnAssets(sport, top);

  const fmt = (o: number) => (o > 0 ? `+${o}` : `${o}`);
  const description = top.length > 0
    ? `${title} favorites: ${top.slice(0, 3).map(t => `${t.name} ${fmt(t.odds)}`).join(' • ')}`
    : `${title} odds comparison on odds.day`;

  const ogParams = new URLSearchParams({ title });
  if (top.length > 0) {
    ogParams.set('teams', JSON.stringify(top.map(t => ({
      n: t.name, o: fmt(t.odds), l: t.logo ?? '', c: t.color ?? '', b: t.book ?? '',
    }))));
  }
  const ogImageUrl = `https://www.odds.day/api/og-futures?${ogParams.toString()}`;

  return {
    title: `${title} Odds | odds.day`,
    description,
    openGraph: {
      title: `${title} Odds`,
      description,
      type: 'website',
      siteName: 'odds.day',
      url: `https://www.odds.day/futures/${sport}`,
      images: [{ url: ogImageUrl, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} Odds`,
      description,
      images: [ogImageUrl],
    },
  };
}

export default async function FuturesSharePage({
  params,
}: {
  params: Promise<{ sport: string }>;
}) {
  const { sport } = await params;
  if (!MARKET_TITLES[sport]) {
    redirect('/');
  }

  const redirectUrl = `/?view=futures&league=${sport}`;

  return (
    <html>
      <head>
        <meta httpEquiv="refresh" content={`0;url=${redirectUrl}`} />
        <script dangerouslySetInnerHTML={{
          __html: `window.location.href = "${redirectUrl}";`
        }} />
      </head>
      <body style={{
        backgroundColor: '#ffffff',
        color: '#0f172a',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        margin: 0,
        fontFamily: 'system-ui, sans-serif'
      }}>
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ marginBottom: '10px' }}>{MARKET_TITLES[sport]}</h1>
          <p>Loading futures...</p>
        </div>
      </body>
    </html>
  );
}
