// src/app/api/og/route.tsx
// Open Graph share card for game links. 1200x630, rendered by Satori —
// flexbox only, every multi-child div needs display:flex.
// Each side wears its team's primary color, fading to a neutral center.
import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

const INK = '#f8fafc';                       // primary text
const INK_SOFT = 'rgba(248,250,252,0.78)';   // team names
const INK_DIM = 'rgba(248,250,252,0.55)';    // muted/underdog
const ACCENT = '#60a5fa';                    // brand accent
const NEUTRAL = '#0e1c33';                   // center + fallback panel base
const SURFACE = 'rgba(255,255,255,0.07)';
const HAIRLINE = 'rgba(255,255,255,0.14)';

// Darken a team color toward the neutral base so white text stays readable.
// Light colors (maize, gold) get pulled down harder than dark ones.
function panelColor(hex: string | null): string {
  if (!hex) return NEUTRAL;
  const h = hex.replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return NEUTRAL;
  const c = [0, 1, 2].map(i => parseInt(h.slice(i * 2, i * 2 + 2), 16));
  const lum = (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
  const t = lum > 0.55 ? 0.62 : lum > 0.35 ? 0.5 : 0.38; // mix ratio toward neutral
  const base = [14, 28, 51]; // NEUTRAL rgb
  const m = c.map((v, i) => Math.round(v * (1 - t) + base[i] * t));
  return `#${m.map(v => v.toString(16).padStart(2, '0')).join('')}`;
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
            backgroundColor: 'rgba(255,255,255,0.12)',
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
  const awayPanel = panelColor(searchParams.get('awayColor'));
  const homePanel = panelColor(searchParams.get('homeColor'));

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
