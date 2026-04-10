import { NextRequest, NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import path from 'path';

export async function GET(request: NextRequest) {
  const host = request.headers.get('host') ?? '';
  const h = host.split(':')[0];
  const isPilot = h === 'pilot.place' || h === 'www.pilot.place' || h === 'pilot.localhost';

  if (isPilot) {
    const icon = readFileSync(path.join(process.cwd(), 'public/pilot-favicon.png'));
    return new NextResponse(icon, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  }

  const icon = readFileSync(path.join(process.cwd(), 'public/favicon.ico'));
  return new NextResponse(icon, {
    headers: {
      'Content-Type': 'image/x-icon',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
