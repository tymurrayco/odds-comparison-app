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
    
    // Forward to Zapier
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(betData)
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