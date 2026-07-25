// src/app/api/og-futures/route.tsx
// Open Graph share card for futures markets: top-5 favorites with best prices.
// Light theme matching the game share card; header carries the market title.
import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

const INK = '#0f172a';
const INK_SOFT = '#334155';
const INK_DIM = '#94a3b8';
const ACCENT = '#2563eb';
const NEUTRAL = '#ffffff';
const SURFACE = 'rgba(15,23,42,0.04)';
const HAIRLINE = 'rgba(15,23,42,0.12)';

// Same pastelizer as the game card (saturation clamped to the pastel band).
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
  const rgb1 = [
    [c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x],
  ][sextant];
  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${rgb1.map(toHex).join('')}`;
}

interface TeamRow {
  n: string;   // name
  o: string;   // formatted odds
  l?: string;  // logo url
  c?: string;  // color hex (no #)
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const title = searchParams.get('title') || 'Futures';
  const more = searchParams.get('more') || '';

  let teams: TeamRow[] = [];
  try {
    const parsed = JSON.parse(searchParams.get('teams') || '[]');
    if (Array.isArray(parsed)) {
      teams = parsed.filter((t): t is TeamRow => t && typeof t.n === 'string' && typeof t.o === 'string').slice(0, 5);
    }
  } catch { /* renders header-only card */ }

  const favPanel = panelColor(teams[0]?.c ?? null);

  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: NEUTRAL,
          backgroundImage: `linear-gradient(180deg, ${favPanel} 0%, ${NEUTRAL} 46%)`,
          padding: '40px 56px',
        }}
      >
        {/* Header: brand left, market title right */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'baseline' }}>
            <span style={{ color: INK, fontSize: '38px', fontWeight: 700 }}>odds</span>
            <span style={{ color: ACCENT, fontSize: '38px', fontWeight: 700 }}>.day</span>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              backgroundColor: SURFACE,
              border: `1px solid ${HAIRLINE}`,
              borderRadius: '999px',
              padding: '10px 26px',
            }}
          >
            <span style={{ color: INK, fontSize: '24px', fontWeight: 700 }}>{title}</span>
          </div>
        </div>

        {/* Favorites list */}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', gap: '10px', marginTop: '18px' }}>
          {teams.map((t, i) => (
            <div
              key={t.n}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '18px',
                backgroundColor: i === 0 ? 'rgba(255,255,255,0.75)' : SURFACE,
                border: `1px solid ${HAIRLINE}`,
                borderRadius: '16px',
                padding: '10px 24px',
              }}
            >
              <span style={{ color: INK_DIM, fontSize: '24px', fontWeight: 700, width: '34px' }}>{i + 1}</span>
              {t.l ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={t.l} alt="" width={46} height={46} style={{ objectFit: 'contain' }} />
              ) : (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '46px',
                    height: '46px',
                    backgroundColor: 'rgba(15,23,42,0.08)',
                    borderRadius: '23px',
                  }}
                >
                  <span style={{ color: INK, fontSize: '22px', fontWeight: 700 }}>{t.n.charAt(0)}</span>
                </div>
              )}
              <span
                style={{
                  color: i === 0 ? INK : INK_SOFT,
                  fontSize: '29px',
                  fontWeight: i === 0 ? 700 : 600,
                  flex: 1,
                }}
              >
                {t.n}
              </span>
              <span style={{ color: i === 0 ? INK : INK_SOFT, fontSize: '31px', fontWeight: 700 }}>{t.o}</span>
            </div>
          ))}
          {teams.length === 0 && (
            <span style={{ color: INK_SOFT, fontSize: '30px', fontWeight: 600, textAlign: 'center' }}>
              Live championship odds comparison
            </span>
          )}
        </div>

        {/* Footer */}
        {more && (
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <span style={{ color: INK_DIM, fontSize: '20px', fontWeight: 600 }}>
              + {more} more on odds.day
            </span>
          </div>
        )}
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
