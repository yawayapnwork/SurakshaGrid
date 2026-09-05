import { NextResponse } from 'next/server';

let cachedToken: string | null = null;
let tokenExpiresAt: number = 0;

/** Distinguishes *why* getOfficerToken failed so the route handler can log a specific,
 *  still-secret-free diagnostic server-side and map it to an appropriate HTTP status for
 *  the browser — never the generic 500 a bare `Error` would collapse everything into.
 *  `httpStatus` is what this route returns to the browser (never a raw proxy of the
 *  backend's status: a 401 from a *misconfigured* ADMIN_PASSWORD_PLAIN is a server-side
 *  problem, not the browser's, so it must not read as "your session is invalid"). */
class OfficerAuthError extends Error {
  constructor(
    message: string,
    public readonly httpStatus: number
  ) {
    super(message);
    this.name = 'OfficerAuthError';
  }
}

async function getOfficerToken(apiBaseUrl: string): Promise<string> {
  const now = Date.now();
  if (cachedToken && tokenExpiresAt > now + 60000) {
    return cachedToken;
  }

  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD_PLAIN;

  if (!password) {
    // Missing configuration: never reachable from user input, always an ops/deploy issue.
    throw new OfficerAuthError('officer auth misconfigured: ADMIN_PASSWORD_PLAIN is not set', 500);
  }

  let res: Response;
  try {
    res = await fetch(`${apiBaseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
      cache: 'no-store',
    });
  } catch (networkErr) {
    // fetch() itself threw: DNS failure, connection refused, timeout — the backend is
    // unreachable, not merely returning an error response.
    const detail = networkErr instanceof Error ? networkErr.message : String(networkErr);
    throw new OfficerAuthError(`officer auth backend unreachable at login: ${detail}`, 502);
  }

  if (!res.ok) {
    if (res.status === 401) {
      // The backend rejected ADMIN_USERNAME/ADMIN_PASSWORD_PLAIN itself — a credential
      // mismatch between this deployment's env vars and the backend's ADMIN_PASSWORD
      // hash, not a real end-user auth failure. Never log the response body: on a 401
      // Twilio-style APIs sometimes echo back the submitted fields.
      throw new OfficerAuthError('officer auth backend rejected configured credentials (401)', 502);
    }
    throw new OfficerAuthError(`officer auth backend returned HTTP ${res.status}`, 502);
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

    // The client (services/api.ts) always sends whatever NEXT_PUBLIC_OFFICER_SESSION_KEY
    // was baked into its build. Check against that same variable — a separate
    // OFFICER_SESSION_SECRET name here would silently diverge from what the client can
    // ever send, since NEXT_PUBLIC_ vars are already public in the client bundle anyway.
    const expectedSessionToken =
      process.env.NEXT_PUBLIC_OFFICER_SESSION_KEY || 'surakshagrid-officer-active-session';

    const isAuthorizedHeader = officerSessionHeader === expectedSessionToken;
    const isAuthorizedCookie = hasOfficerCookie;

    if (!isAuthorizedHeader && !isAuthorizedCookie) {
      return NextResponse.json(
        { error: 'Unauthorized: Missing or invalid officer session header or cookie' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { action, sim_id, to, message, priority, sos_id } = body;

    const apiBaseUrl = (
      process.env.NEXT_PUBLIC_API_URL ||
      process.env.NEXT_PUBLIC_API_BASE_URL ||
      process.env.API_BASE_URL ||
      'http://127.0.0.1:8000'
    ).replace(/\/$/, '');

    let endpointPath = '';
    let backendBody: string | undefined;
    if (action === 'trigger') {
      endpointPath = '/api/v1/simulation/trigger';
    } else if (action === 'reset') {
      endpointPath = '/api/v1/simulation/reset';
    } else if (action === 'optimize') {
      endpointPath = '/api/v1/dispatch/optimize';
    } else if (action === 'send-sms') {
      // Note: Must stay in sync with backend POST /api/alerts/send-sms JSON body
      // (SMSAlertRequest: to, message, priority).
      endpointPath = '/api/alerts/send-sms';
      backendBody = JSON.stringify({ to, message, priority });
    } else if (action === 'resolve-sos') {
      if (!sos_id) {
        return NextResponse.json({ error: "Missing 'sos_id' for resolve-sos action" }, { status: 400 });
      }
      // Note: Must stay in sync with backend POST /api/v1/sos/{id}/resolve (path param,
      // no request body).
      endpointPath = `/api/v1/sos/${encodeURIComponent(sos_id)}/resolve`;
    } else {
      return NextResponse.json({ error: 'Invalid officer action' }, { status: 400 });
    }

    if (sim_id) {
      endpointPath += `?sim_id=${encodeURIComponent(sim_id)}`;
    }

    let token = await getOfficerToken(apiBaseUrl);

    let backendRes = await fetch(`${apiBaseUrl}${endpointPath}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: backendBody,
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
        body: backendBody,
        cache: 'no-store',
      });
    }

    const data = await backendRes.json();
    return NextResponse.json(data, { status: backendRes.status });
  } catch (err) {
    if (err instanceof OfficerAuthError) {
      // Safe to log in full: every OfficerAuthError message above is constructed without
      // ever interpolating a password, token, or backend response body.
      console.error(`officer-action: ${err.message}`);
      return NextResponse.json(
        { error: 'Officer authentication is temporarily unavailable. Please try again shortly.' },
        { status: err.httpStatus }
      );
    }
    // Anything else (e.g. the protected-endpoint fetch itself failing) — log only the
    // error's type/message, never the request we sent (which carries the Bearer token).
    console.error('Error in officer-action route handler:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
