// src/app/api/og-bet/route.tsx
// Open Graph card for a single tracked bet — used by /bet/[id] so Discord
// (via Zapier) unfurls the actual wager instead of a generic odds.day link.
// Same light theme + pastel team panel as the game share card.
import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

const INK = '#0f172a';
const INK_SOFT = '#334155';
const ACCENT = '#2563eb';
const NEUTRAL = '#ffffff';
const SURFACE = 'rgba(15,23,42,0.04)';
const HAIRLINE = 'rgba(15,23,42,0.12)';

const STATUS = {
  pending: { label: 'PENDING', fg: '#1d4ed8', bg: 'rgba(37,99,235,0.10)' },
  won: { label: 'WON', fg: '#047857', bg: 'rgba(5,150,105,0.12)' },
  lost: { label: 'LOST', fg: '#b91c1c', bg: 'rgba(220,38,38,0.10)' },
  push: { label: 'PUSH', fg: '#475569', bg: 'rgba(71,85,105,0.10)' },
} as const;

// Same pastelizer as the game card: keep the hue, clamp saturation into the
// pastel band, lift lightness. Achromatic primaries fall back to light gray.
function panelColor(hex: string | null): string {
  if (!hex) return NEUTRAL;
  const raw = hex.replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) return NEUTRAL;
  const [r, g, b] = [0, 1, 2].map(i => parseInt(raw.slice(i * 2, i * 2 + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let hue = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) hue = ((g - b) / d) % 6;
    else if (max === g) hue = (b - r) / d + 2;
    else hue = (r - g) / d + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }
  if (s < 0.15) return '#e9ebef';
  const S = Math.min(0.62, Math.max(s, 0.45));
  const L = 0.85;
  const c = (1 - Math.abs(2 * L - 1)) * S;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = L - c / 2;
  const sextant = Math.floor(hue / 60) % 6;
  const rgb1 = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][sextant];
  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${rgb1.map(toHex).join('')}`;
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);

  const pick = searchParams.get('pick') || 'Bet';
  const matchup = searchParams.get('matchup') || '';
  const league = searchParams.get('league') || '';
  const when = searchParams.get('when') || '';
  const odds = searchParams.get('odds') || '';
  const units = searchParams.get('units') || '';
  const book = searchParams.get('book') || '';
  const logo = searchParams.get('logo') || '';
  const status = (searchParams.get('status') || 'pending') as keyof typeof STATUS;
  const panel = panelColor(searchParams.get('color'));
  const st = STATUS[status] ?? STATUS.pending;

  const bookFile: Record<string, string> = {
    DraftKings: 'draftkings.png', FanDuel: 'fd.png', BetMGM: 'betmgm.png',
    BetRivers: 'betrivers.png', Caesars: 'caesars.png',
    'BetOnline.ag': 'betonline.png', Kalshi: 'kalshi.png',
  };

  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: NEUTRAL,
          backgroundImage: `linear-gradient(160deg, ${panel} 0%, ${NEUTRAL} 52%)`,
          padding: '44px 56px',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'baseline' }}>
            <span style={{ color: ACCENT, fontSize: '38px', fontWeight: 700 }}>odds</span>
            <span style={{ color: INK, fontSize: '38px', fontWeight: 700 }}>.day</span>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              backgroundColor: st.bg,
              border: `1px solid ${HAIRLINE}`,
              borderRadius: '999px',
              padding: '10px 24px',
            }}
          >
            <span style={{ color: st.fg, fontSize: '22px', fontWeight: 700, letterSpacing: '2px' }}>
              {st.label}
            </span>
          </div>
        </div>

        {/* The pick — hero */}
        <div style={{ display: 'flex', flex: 1, alignItems: 'center', gap: '34px' }}>
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="" width={150} height={150} style={{ objectFit: 'contain' }} />
          ) : (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '150px',
                height: '150px',
                backgroundColor: 'rgba(15,23,42,0.08)',
                borderRadius: '75px',
              }}
            >
              <span style={{ fontSize: '64px', fontWeight: 700, color: INK }}>{pick.charAt(0)}</span>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
            <span style={{ color: INK, fontSize: '62px', fontWeight: 700, lineHeight: 1.1 }}>
              {pick}
            </span>
            {matchup && (
              <span style={{ color: INK_SOFT, fontSize: '28px', fontWeight: 600, marginTop: '10px' }}>
                {matchup}
              </span>
            )}
            {(league || when) && (
              <span style={{ color: INK_SOFT, fontSize: '25px', fontWeight: 600, marginTop: '6px' }}>
                {[league, when].filter(Boolean).join('  ·  ')}
              </span>
            )}
          </div>
        </div>

        {/* Stat row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            backgroundColor: SURFACE,
            border: `1px solid ${HAIRLINE}`,
            borderRadius: '20px',
            padding: '22px 10px',
          }}
        >
          {odds && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
              <span style={{ color: INK_SOFT, fontSize: '20px', fontWeight: 600, letterSpacing: '2px' }}>ODDS</span>
              <span style={{ color: INK, fontSize: '44px', fontWeight: 700 }}>{odds}</span>
            </div>
          )}
          {odds && units && <div style={{ display: 'flex', width: '1px', height: '60px', backgroundColor: HAIRLINE }} />}
          {units && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
              <span style={{ color: INK_SOFT, fontSize: '20px', fontWeight: 600, letterSpacing: '2px' }}>UNITS</span>
              <span style={{ color: INK, fontSize: '44px', fontWeight: 700 }}>{units}</span>
            </div>
          )}
          {units && book && <div style={{ display: 'flex', width: '1px', height: '60px', backgroundColor: HAIRLINE }} />}
          {book && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, gap: '4px' }}>
              <span style={{ color: INK_SOFT, fontSize: '20px', fontWeight: 600, letterSpacing: '2px' }}>BOOK</span>
              {bookFile[book] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`${origin}/bookmaker-logos/${bookFile[book]}`} alt="" width={88} height={40} style={{ objectFit: 'contain' }} />
              ) : (
                <span style={{ color: INK, fontSize: '38px', fontWeight: 700 }}>{book}</span>
              )}
            </div>
          )}
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
