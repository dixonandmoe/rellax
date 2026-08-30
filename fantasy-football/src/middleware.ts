import { NextResponse, type NextRequest } from 'next/server';

/**
 * Password gate for public deployments.
 *
 * This app has no user accounts yet, and a deployed instance holds ESPN session cookies
 * server-side. Rather than ship something that is safe only if you remember to configure
 * it, the rule is explicit:
 *
 *  - `DASHBOARD_PASSWORD` set  -> every request needs it (HTTP Basic).
 *  - Not set, no ESPN cookies  -> open. This is local development against sample data.
 *  - Not set, ESPN cookies set -> refuse to serve, and say why. A deployment holding real
 *    credentials must never be anonymously readable by accident.
 *
 * Replace this with real authentication when accounts land; see PROJECT_PLAN.md phase 7.
 */
export function middleware(request: NextRequest) {
  const password = process.env.DASHBOARD_PASSWORD;
  const hasEspnCredentials = Boolean(process.env.ESPN_S2 && process.env.ESPN_SWID);

  if (!password) {
    if (!hasEspnCredentials) return NextResponse.next();

    return new NextResponse(
      'This deployment has ESPN credentials configured but no DASHBOARD_PASSWORD.\n\n' +
        'Anyone who found this URL could read your league data, so the app is refusing to\n' +
        'serve anonymously. Set DASHBOARD_PASSWORD in the server environment and redeploy.\n',
      { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
    );
  }

  const header = request.headers.get('authorization');
  if (header?.startsWith('Basic ')) {
    const decoded = safeDecode(header.slice(6));
    // Any username is accepted; the password is the secret.
    const supplied = decoded?.slice(decoded.indexOf(':') + 1);
    if (supplied !== undefined && constantTimeEquals(supplied, password)) {
      return NextResponse.next();
    }
  }

  return new NextResponse('Authentication required.', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Fantasy Football Front Office", charset="UTF-8"',
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}

function safeDecode(value: string): string | null {
  try {
    return atob(value);
  } catch {
    return null;
  }
}

/** Compare without leaking length or position through timing. */
export function constantTimeEquals(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  // Always compare a fixed number of bytes so a length mismatch is not a fast path.
  let mismatch = left.length === right.length ? 0 : 1;
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i++) {
    mismatch |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }
  return mismatch === 0;
}

export const config = {
  // Everything except Next's own static assets and the favicon.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
