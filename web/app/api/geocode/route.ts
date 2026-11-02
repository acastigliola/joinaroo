import { NextRequest, NextResponse } from 'next/server';

// Proxies the backend geocode endpoint so the browser never needs
// direct CORS access to the API service.
const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q') ?? '';
  try {
    const res = await fetch(
      `${API_BASE_URL}/api/geocode?q=${encodeURIComponent(q)}`,
      { cache: 'no-store' },
    );
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      { error: 'geocode service unavailable' },
      { status: 502 },
    );
  }
}
