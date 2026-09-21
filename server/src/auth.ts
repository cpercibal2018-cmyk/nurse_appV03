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

/** Roles allowed to mutate data through the generic CRUD routes. */
export const WRITE_ROLES = ['HR_ADMIN', 'SYSTEM_ADMIN'];
