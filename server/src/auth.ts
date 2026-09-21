// Real JWT authentication for the API — HS256, signed and verified with a
// server secret, with expiry. Implemented on node:crypto so the server keeps
// its tiny dependency surface (express + prisma + cors) and needs no install.
//
// Scope (stage 1): this proves *who* the caller is and *what role* they hold,
// and gates every data route on a valid token. It deliberately does NOT yet
// add a bcrypt user store, refresh-token rotation, or CSRF — those need the
// database and are the documented stage-2 work (see .env.example / LoginPage).

import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';

const SECRET = process.env.JWT_SECRET;
if (!SECRET) {
  console.warn(
    '[auth] JWT_SECRET is not set — using an insecure development secret. ' +
      'Set JWT_SECRET (min 32 chars) before deploying.',
  );
}
// A stable fallback so dev works out of the box; never used when JWT_SECRET is set.
const KEY = SECRET || 'dev-insecure-secret-change-me-0000000000000000';

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // 15 minutes

export interface TokenClaims {
  sub: number;
  email: string;
  role: string;
  name: string;
  iat: number;
  exp: number;
}

const b64urlJson = (obj: unknown) => Buffer.from(JSON.stringify(obj)).toString('base64url');
const hmac = (data: string) => crypto.createHmac('sha256', KEY).update(data).digest('base64url');

export function signToken(
  payload: { sub: number; email: string; role: string; name: string },
  ttlSeconds: number = ACCESS_TOKEN_TTL_SECONDS,
): string {
  const now = Math.floor(Date.now() / 1000);
  const header = b64urlJson({ alg: 'HS256', typ: 'JWT' });
  const body = b64urlJson({ ...payload, iat: now, exp: now + ttlSeconds });
  const data = `${header}.${body}`;
  return `${data}.${hmac(data)}`;
}

export function verifyToken(token: string): TokenClaims {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('malformed token');
  const [h, p, sig] = parts;

  // Pin the algorithm. Never trust the token's own header to pick the verifier —
  // that is how "alg: none" and HS/RS confusion attacks get in.
  let header: any;
  try {
    header = JSON.parse(Buffer.from(h, 'base64url').toString());
  } catch {
    throw new Error('bad header');
  }
  if (header?.alg !== 'HS256' || header?.typ !== 'JWT') throw new Error('unsupported alg');

  // Constant-time signature comparison.
  const expected = Buffer.from(hmac(`${h}.${p}`));
  const actual = Buffer.from(sig);
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    throw new Error('bad signature');
  }

  let claims: TokenClaims;
  try {
    claims = JSON.parse(Buffer.from(p, 'base64url').toString());
  } catch {
    throw new Error('bad payload');
  }
  if (typeof claims.exp !== 'number' || claims.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('token expired');
  }
  return claims;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: TokenClaims;
    }
  }
}

/** Reject any request without a valid, unexpired Bearer token (401). */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  const match = /^Bearer (.+)$/.exec(header);
  if (!match) return res.status(401).json({ error: 'Authentication required' });
  try {
    req.user = verifyToken(match[1]);
    return next();
  } catch {
    // The reason (expired vs bad signature) is deliberately not disclosed.
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/** Require the authenticated caller to hold one of `roles` (403 otherwise). */
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient role', requiredRoles: roles });
    }
    return next();
  };
}

/** Roles allowed to mutate data through the generic CRUD routes. DEVELOPER is a
 *  full-access role for development/testing. */
export const WRITE_ROLES = ['HR_ADMIN', 'SYSTEM_ADMIN', 'DEVELOPER'];

// ── Refresh tokens & CSRF (stage 2) ─────────────────────────────────────────

const isProd = process.env.NODE_ENV === 'production';

export const REFRESH_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
export const REFRESH_COOKIE = 'nurseapp_refresh';
export const CSRF_COOKIE = 'nurseapp_csrf';

/** URL-safe random string (default 32 bytes of entropy). */
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');

/** SHA-256 hex — used to store only a hash of the refresh secret, never the secret. */
export const sha256hex = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

/** Cookie options for the HttpOnly refresh token — never readable by script. */
export function refreshCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: isProd, // require HTTPS in production; off for local http dev
    path: '/api/auth', // only ever sent to the auth endpoints
    maxAge: REFRESH_TTL_SECONDS * 1000,
  };
}

/** Cookie options for the CSRF token — deliberately readable so the SPA can echo it. */
export function csrfCookieOptions() {
  return {
    httpOnly: false,
    sameSite: 'lax' as const,
    secure: isProd,
    path: '/',
    maxAge: REFRESH_TTL_SECONDS * 1000,
  };
}

/**
 * Double-submit CSRF check: the X-CSRF-Token header must equal the CSRF cookie.
 * A cross-site attacker can ride the cookie but cannot read it to set the header.
 */
export function csrfOk(req: Request): boolean {
  const cookieToken = (req as any).cookies?.[CSRF_COOKIE];
  const headerToken = req.headers['x-csrf-token'];
  const header = Array.isArray(headerToken) ? headerToken[0] : headerToken;
  return !!cookieToken && !!header && constantTimeEqual(String(cookieToken), String(header));
}

/**
 * Origin allow-list check for state-changing auth requests (defense in depth
 * alongside CSRF). If an Origin/Referer is present it must match; requests with
 * neither (e.g. curl) are allowed through to the CSRF gate.
 */
export function originOk(req: Request): boolean {
  const allowed = process.env.CORS_ORIGIN;
  if (!allowed) return true; // not configured → don't block (dev)
  let origin = typeof req.headers.origin === 'string' ? req.headers.origin : '';
  if (!origin && typeof req.headers.referer === 'string') {
    // A malformed Referer must not throw (that would 500 the request); treat an
    // unparseable value as "no origin" and defer to the CSRF check.
    try { origin = new URL(req.headers.referer).origin; } catch { origin = ''; }
  }
  if (!origin) return true;
  return origin === allowed;
}
