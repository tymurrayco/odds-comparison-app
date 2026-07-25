// src/app/api/og/route.tsx
// Open Graph share card for game links. 1200x630, rendered by Satori —
// flexbox only, every multi-child div needs display:flex.
import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

const INK = '#f8fafc';        // primary text
const INK_MUTED = '#8fa3bd';  // labels / secondary
const ACCENT = '#60a5fa';     // brand accent
const SURFACE = 'rgba(255,255,255,0.06)';
const HAIRLINE = 'rgba(255,255,255,0.12)';

function TeamColumn({ logo, name, implied, dim }: {
  logo: string;
  name: string;
  implied: string;
  dim: boolean;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '18px', width: '320px' }}>
      {/* Logo chip — light surface so dark logos keep contrast */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '150px',
          height: '150px',
          backgroundColor: '#ffffff',
          borderRadius: '32px',
          boxShadow: '0 8px 30px rgba(0,0,0,0.35)',
        }}
      >
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt="" width={110} height={110} style={{ objectFit: 'contain' }} />
        ) : (
          <span style={{ fontSize: '64px', fontWeight: 700, color: '#1e3a5f' }}>
            {name.charAt(0)}
          </span>
        )}
      </div>
      {/* Fixed two-line name box so implied scores align across columns */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '70px',
          maxWidth: '300px',
        }}
      >
        <span
          style={{
            color: INK_MUTED,
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
            color: dim ? INK_MUTED : INK,
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
          backgroundColor: '#0b1626',
          backgroundImage:
            'linear-gradient(150deg, #16294a 0%, #0e1c33 55%, #0a1422 100%)',
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
            {time && <span style={{ color: INK_MUTED, fontSize: '24px', fontWeight: 600 }}>{time}</span>}
          </div>
        </div>

        {/* Matchup — implied scores are the hero */}
        <div
          style={{
            display: 'flex',
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            gap: '36px',
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
            <span style={{ color: INK_MUTED, fontSize: '34px', fontWeight: 600 }}>@</span>
            {hasImplied && (
              <span
                style={{
                  color: INK_MUTED,
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
                <span style={{ color: INK_MUTED, fontSize: '18px', fontWeight: 600, letterSpacing: '2px' }}>SPREAD</span>
                <span style={{ color: INK, fontSize: '34px', fontWeight: 700 }}>{spread}</span>
              </div>
            )}
            {spread && total && (
              <div style={{ display: 'flex', width: '1px', height: '52px', backgroundColor: HAIRLINE }} />
            )}
            {total && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                <span style={{ color: INK_MUTED, fontSize: '18px', fontWeight: 600, letterSpacing: '2px' }}>TOTAL</span>
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
