import { NextResponse } from 'next/server';

let cachedToken: string | null = null;
let tokenExpiresAt: number = 0;

async function getOfficerToken(apiBaseUrl: string): Promise<string> {
  const now = Date.now();
  if (cachedToken && tokenExpiresAt > now + 60000) {
    return cachedToken;
  }

  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD_PLAIN;

  if (!password) {
    throw new Error('ADMIN_PASSWORD_PLAIN environment variable is not configured on the server');
  }

  const res = await fetch(`${apiBaseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`Server-side officer authentication failed with status ${res.status}`);
  }

  const data = await res.json();
  const token = data.access_token;
  cachedToken = token;
  tokenExpiresAt = Date.now() + 1800 * 1000;
  return token;
}

export async function POST(request: Request) {
  try {
    // Access control layer: Require X-Officer-Session header or officer_session cookie
    const officerSessionHeader =
      request.headers.get('X-Officer-Session') || request.headers.get('x-officer-session');
    const cookieHeader = request.headers.get('cookie') || '';
    const hasOfficerCookie = cookieHeader.includes('officer_session=');

    const expectedSessionToken =
      process.env.OFFICER_SESSION_SECRET || 'surakshagrid-officer-active-session';

    const isAuthorizedHeader = officerSessionHeader === expectedSessionToken;
    const isAuthorizedCookie = hasOfficerCookie;

    if (!isAuthorizedHeader && !isAuthorizedCookie) {
      return NextResponse.json(
        { error: 'Unauthorized: Missing or invalid officer session header or cookie' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { action } = body;

    const apiBaseUrl = (
      process.env.NEXT_PUBLIC_API_URL ||
      process.env.NEXT_PUBLIC_API_BASE_URL ||
      process.env.API_BASE_URL ||
      'http://127.0.0.1:8000'
    ).replace(/\/$/, '');

    let endpointPath = '';
    if (action === 'trigger') {
      endpointPath = '/api/v1/simulation/trigger';
    } else if (action === 'reset') {
      endpointPath = '/api/v1/simulation/reset';
    } else if (action === 'optimize') {
      endpointPath = '/api/v1/dispatch/optimize';
    } else {
      return NextResponse.json({ error: 'Invalid officer action' }, { status: 400 });
    }

    let token = await getOfficerToken(apiBaseUrl);

    let backendRes = await fetch(`${apiBaseUrl}${endpointPath}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
    });

    if (backendRes.status === 401) {
      cachedToken = null;
      token = await getOfficerToken(apiBaseUrl);
      backendRes = await fetch(`${apiBaseUrl}${endpointPath}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        cache: 'no-store',
      });
    }

    const data = await backendRes.json();
    return NextResponse.json(data, { status: backendRes.status });
  } catch (err: any) {
    console.error('Error in officer-action route handler:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
