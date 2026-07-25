// src/app/api/og/route.tsx
// Open Graph share card for game links. 1200x630, rendered by Satori —
// flexbox only, every multi-child div needs display:flex.
// Each side wears its team's primary color, fading to a neutral center.
import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

const INK = '#0f172a';                    // primary text
const INK_SOFT = '#334155';               // team names / labels
const INK_DIM = '#94a3b8';                // muted/underdog
const ACCENT = '#2563eb';                 // brand accent
const NEUTRAL = '#ffffff';                // center + fallback panel base
const SURFACE = 'rgba(15,23,42,0.04)';
const HAIRLINE = 'rgba(15,23,42,0.12)';

// Pastelize a team color: keep the hue, floor the saturation, lift lightness
// to a fixed pastel level. A plain mix-toward-white desaturated dark navies
// (Cal #003262) into grey — HSL keeps the hue's identity at any darkness.
// Achromatic primaries (Steelers black) must NOT get the saturation floor —
// that invents a hue (0 = red → pink). Fall back to the alternate color;
// if that's achromatic too (Raiders black/silver), render an honest gray tint.
function parseHsl(hex: string | null): { hue: number; s: number } | null {
  if (!hex) return null;
  const raw = hex.replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) return null;
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
  return { hue, s };
}

function panelColor(hex: string | null, altHex: string | null = null): string {
  let hsl = parseHsl(hex);
  if (!hsl) return NEUTRAL;
  if (hsl.s < 0.15) {
    const alt = parseHsl(altHex);
    if (alt && alt.s >= 0.15) {
      hsl = alt;
    } else {
      return '#e9ebef'; // genuinely gray/black/silver identity → light gray tint
    }
  }
  const S = Math.min(1, Math.max(hsl.s, 0.45));
  const L = 0.85;
  const c = (1 - Math.abs(2 * L - 1)) * S;
  const x = c * (1 - Math.abs(((hsl.hue / 60) % 2) - 1));
  const m = L - c / 2;
  const sextant = Math.floor(hsl.hue / 60) % 6;
  const rgb1 = [
    [c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x],
  ][sextant];
  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${rgb1.map(toHex).join('')}`;
}

function TeamColumn({ logo, name, implied, dim }: {
  logo: string;
  name: string;
  implied: string;
  dim: boolean;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', width: '340px' }}>
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="" width={160} height={160} style={{ objectFit: 'contain' }} />
      ) : (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '160px',
            height: '160px',
            backgroundColor: 'rgba(15,23,42,0.08)',
            borderRadius: '80px',
          }}
        >
          <span style={{ fontSize: '68px', fontWeight: 700, color: INK }}>
            {name.charAt(0)}
          </span>
        </div>
      )}
      {/* Fixed two-line name box so implied scores align across columns */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '70px',
          maxWidth: '310px',
        }}
      >
        <span
          style={{
            color: INK_SOFT,
            fontSize: '27px',
            fontWeight: 600,
            textAlign: 'center',
            lineHeight: 1.25,
          }}
        >
          {name}
        </span>
      </div>
      {implied && (
        <span
          style={{
            color: dim ? INK_DIM : INK,
            fontSize: '76px',
            fontWeight: 700,
            lineHeight: 1,
            marginTop: '-6px',
          }}
        >
          {implied}
        </span>
      )}
    </div>
  );
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const awayTeam = searchParams.get('away') || 'Away Team';
  const homeTeam = searchParams.get('home') || 'Home Team';
  const spread = searchParams.get('spread') || '';
  const total = searchParams.get('total') || '';
  const league = searchParams.get('league') || '';
  const time = searchParams.get('time') || '';
  const awayLogo = searchParams.get('awayLogo') || '';
  const homeLogo = searchParams.get('homeLogo') || '';
  const impliedAway = searchParams.get('impliedAway') || '';
  const impliedHome = searchParams.get('impliedHome') || '';
  const awayPanel = panelColor(searchParams.get('awayColor'), searchParams.get('awayAlt'));
  const homePanel = panelColor(searchParams.get('homeColor'), searchParams.get('homeAlt'));

  const hasImplied = impliedAway !== '' && impliedHome !== '';
  const awayScore = hasImplied ? String(Math.round(Number(impliedAway))) : '';
  const homeScore = hasImplied ? String(Math.round(Number(impliedHome))) : '';
  const homeFavored = hasImplied && Number(impliedHome) >= Number(impliedAway);

  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: NEUTRAL,
          backgroundImage: `linear-gradient(90deg, ${awayPanel} 0%, ${NEUTRAL} 42%, ${NEUTRAL} 58%, ${homePanel} 100%)`,
          padding: '44px 56px',
        }}
      >
        {/* Header: brand left, league + time right */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline' }}>
            <span style={{ color: INK, fontSize: '38px', fontWeight: 700 }}>odds</span>
            <span style={{ color: ACCENT, fontSize: '38px', fontWeight: 700 }}>.day</span>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              backgroundColor: SURFACE,
              border: `1px solid ${HAIRLINE}`,
              borderRadius: '999px',
              padding: '10px 26px',
            }}
          >
            <span style={{ color: INK, fontSize: '24px', fontWeight: 700 }}>{league}</span>
            {time && <span style={{ color: INK_SOFT, fontSize: '24px', fontWeight: 600 }}>{time}</span>}
          </div>
        </div>

        {/* Matchup — implied scores are the hero */}
        <div
          style={{
            display: 'flex',
            flex: 1,
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <TeamColumn logo={awayLogo} name={awayTeam} implied={awayScore} dim={hasImplied && homeFavored} />
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '8px',
              marginTop: hasImplied ? '-40px' : '0px',
            }}
          >
            <span style={{ color: INK_DIM, fontSize: '34px', fontWeight: 600 }}>@</span>
            {hasImplied && (
              <span
                style={{
                  color: INK_DIM,
                  fontSize: '17px',
                  fontWeight: 600,
                  letterSpacing: '2px',
                }}
              >
                PROJECTED
              </span>
            )}
          </div>
          <TeamColumn logo={homeLogo} name={homeTeam} implied={homeScore} dim={hasImplied && !homeFavored} />
        </div>

        {/* Stat row: spread / total */}
        {(spread || total) && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0px',
              backgroundColor: SURFACE,
              border: `1px solid ${HAIRLINE}`,
              borderRadius: '20px',
              padding: '18px 10px',
            }}
          >
            {spread && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                <span style={{ color: INK_SOFT, fontSize: '18px', fontWeight: 600, letterSpacing: '2px' }}>SPREAD</span>
                <span style={{ color: INK, fontSize: '34px', fontWeight: 700 }}>{spread}</span>
              </div>
            )}
            {spread && total && (
              <div style={{ display: 'flex', width: '1px', height: '52px', backgroundColor: HAIRLINE }} />
            )}
            {total && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                <span style={{ color: INK_SOFT, fontSize: '18px', fontWeight: 600, letterSpacing: '2px' }}>TOTAL</span>
                <span style={{ color: INK, fontSize: '34px', fontWeight: 700 }}>O/U {total}</span>
              </div>
            )}
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
