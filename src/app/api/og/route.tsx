// src/app/api/og/route.tsx
import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

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
  const awayName = searchParams.get('awayName') || awayTeam.split(' ').slice(-1)[0];
  const homeName = searchParams.get('homeName') || homeTeam.split(' ').slice(-1)[0];

  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#1e3a5f',
          backgroundImage: 'linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%)',
          padding: '40px',
        }}
      >
        {/* League badge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(255,255,255,0.1)',
            borderRadius: '20px',
            padding: '8px 20px',
            marginBottom: '30px',
          }}
        >
          <span style={{ color: '#94a3b8', fontSize: '24px', fontWeight: 600 }}>
            {league} {time ? `• ${time}` : ''}
          </span>
        </div>

        {/* Teams row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '40px',
          }}
        >
          {/* Away team */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '15px',
            }}
          >
            {awayLogo ? (
              <img
                src={awayLogo}
                width={120}
                height={120}
                style={{ objectFit: 'contain' }}
              />
            ) : (
              <div
                style={{
                  width: '120px',
                  height: '120px',
                  backgroundColor: 'rgba(255,255,255,0.1)',
                  borderRadius: '60px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span style={{ fontSize: '48px', color: '#fff' }}>
                  {awayTeam.charAt(0)}
                </span>
              </div>
            )}
            <span
              style={{
                color: '#fff',
                fontSize: '28px',
                fontWeight: 700,
                textAlign: 'center',
                maxWidth: '200px',
              }}
            >
              {awayTeam.split(' ').slice(-1)[0]}
            </span>
          </div>

          {/* @ symbol */}
          <span
            style={{
              color: '#64748b',
              fontSize: '36px',
              fontWeight: 700,
            }}
          >
            @
          </span>

          {/* Home team */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '15px',
            }}
          >
            {homeLogo ? (
              <img
                src={homeLogo}
                width={120}
                height={120}
                style={{ objectFit: 'contain' }}
              />
            ) : (
              <div
                style={{
                  width: '120px',
                  height: '120px',
                  backgroundColor: 'rgba(255,255,255,0.1)',
                  borderRadius: '60px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span style={{ fontSize: '48px', color: '#fff' }}>
                  {homeTeam.charAt(0)}
                </span>
              </div>
            )}
            <span
              style={{
                color: '#fff',
                fontSize: '28px',
                fontWeight: 700,
                textAlign: 'center',
                maxWidth: '200px',
              }}
            >
              {homeTeam.split(' ').slice(-1)[0]}
            </span>
          </div>
        </div>

        {/* Odds info */}
        {(spread || total) && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '30px',
              marginTop: '35px',
              backgroundColor: 'rgba(255,255,255,0.05)',
              borderRadius: '15px',
              padding: '15px 30px',
            }}
          >
            {spread && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <span style={{ color: '#64748b', fontSize: '16px' }}>SPREAD</span>
                <span style={{ color: '#fff', fontSize: '28px', fontWeight: 700 }}>{spread}</span>
              </div>
            )}
            {spread && total && (
              <div style={{ width: '1px', height: '40px', backgroundColor: 'rgba(255,255,255,0.2)' }} />
            )}
            {total && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <span style={{ color: '#64748b', fontSize: '16px' }}>TOTAL</span>
                <span style={{ color: '#fff', fontSize: '28px', fontWeight: 700 }}>O/U {total}</span>
              </div>
            )}
          </div>
        )}

        {/* Implied scores */}
        {impliedAway && impliedHome && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              marginTop: '15px',
            }}
          >
            <span style={{ color: '#64748b', fontSize: '18px' }}>Implied:</span>
            <span style={{ color: '#94a3b8', fontSize: '20px', fontWeight: 600 }}>
              {awayName} {impliedAway} - {homeName} {impliedHome}
            </span>
          </div>
        )}

        {/* Site branding */}
        <div
          style={{
            position: 'absolute',
            bottom: '25px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <span style={{ color: '#64748b', fontSize: '20px', fontWeight: 600 }}>
            odds.day
          </span>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}