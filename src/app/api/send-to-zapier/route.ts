// src/app/api/send-to-zapier/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const webhookUrl = process.env.ZAPIER_WEBHOOK_URL;
    
    if (!webhookUrl) {
      return NextResponse.json(
        { error: 'Zapier webhook URL not configured' },
        { status: 500 }
      );
    }
    
    // Get the bet data from the request
    const betData = await request.json();

    // Attach a share URL so downstream (Zapier -> Discord) can post a link
    // that unfurls as the actual wager instead of a generic odds.day card.
    const oddsStr = typeof betData.odds === 'number' && betData.odds > 0
      ? `+${betData.odds}`
      : `${betData.odds}`;
    const payload = {
      ...betData,
      shareUrl: betData.id ? `https://www.odds.day/bet/${betData.id}` : 'https://www.odds.day',
      // Ready-made one-liner for the Discord step
      summary: [betData.bet, oddsStr, `${betData.stake}u`, betData.book]
        .filter(Boolean)
        .join(' · '),
    };

    // Forward to Zapier
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      throw new Error(`Zapier webhook failed: ${response.status}`);
    }
    
    return NextResponse.json({ success: true });
    
  } catch (error) {
    console.error('Error sending to Zapier:', error);
    return NextResponse.json(
      { error: 'Failed to send to Zapier' },
      { status: 500 }
    );
  }
}