import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import {
  signToken, requireAuth, requireRole, WRITE_ROLES, ACCESS_TOKEN_TTL_SECONDS,
  randomToken, sha256hex, REFRESH_TTL_SECONDS, REFRESH_COOKIE, CSRF_COOKIE,
  refreshCookieOptions, csrfCookieOptions, csrfOk, originOk,
} from './auth.js';

const prisma = new PrismaClient();
const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || true, credentials: true }));
app.use(express.json({ limit: '5mb' }));
app.use(cookieParser());

// Entity registry — url segment -> { delegate, idField, idIsInt, readOnly }.
// One generic set of handlers covers every table so the API stays small.
//
// `readOnly` carries the reason a collection must never be mutated through this
// generic router:
//
//   audit-entries — §9.1 makes the audit trail append-only and hash-chained. A
//                   row's hash and previousHash must be computed by
//                   fn_append_audit_entry inside the transaction that caused the
//                   event; if a client can POST/PUT/DELETE here it can forge,
//                   rewrite or erase history and sever the chain undetectably.
//   notifications — there is no recipient model yet, so nothing could authorise
//                   a write, and markNotificationRead is per-user by definition.
//
// NOTE: readOnly protects an append-only invariant. It is NOT an authorisation
// model — every route below is still unauthenticated (see the login stub and
// ANALYSIS_2026-09-21.md §2). Do not read this as access control.
const ENTITIES: Record<string, { model: any; idField: string; idIsInt: boolean; readOnly?: string }> = {
  departments:            { model: prisma.department,           idField: 'id',   idIsInt: true },
  units:                  { model: prisma.unit,                 idField: 'id',   idIsInt: true },
  positions:              { model: prisma.position,             idField: 'code', idIsInt: false },
  employees:              { model: prisma.employee,             idField: 'id',   idIsInt: true },
  contracts:              { model: prisma.contract,             idField: 'id',   idIsInt: true },
  'credential-categories':{ model: prisma.credentialCategory,   idField: 'code', idIsInt: false },
  'credential-templates': { model: prisma.credentialTemplate,   idField: 'id',   idIsInt: true },
  'credential-requirements':{ model: prisma.credentialRequirement, idField: 'id', idIsInt: true },
  credentials:            { model: prisma.credential,           idField: 'id',   idIsInt: true },
  'shift-assignments':    { model: prisma.shiftAssignment,      idField: 'id',   idIsInt: true },
  notifications:          { model: prisma.notification,         idField: 'id',   idIsInt: true,
                            readOnly: 'no recipient model exists yet, so no write could be authorised' },
  'audit-entries':        { model: prisma.auditEntry,           idField: 'id',   idIsInt: true,
                            readOnly: 'the audit trail is append-only and hash-chained (§9.1); rows are written by fn_append_audit_entry, never by clients' },
};

// Look the URL segment up as an OWN property. A bare `ENTITIES[req.params.entity]`
// walks the prototype chain, so `/api/constructor`, `/api/__proto__` and
// `/api/toString` are all truthy, sail past the unknown-entity guard, and surface
// as a 500 that leaks internal error text to the caller.
const entityConfig = (segment: string) =>
  Object.hasOwn(ENTITIES, segment) ? ENTITIES[segment] : undefined;

const coerceId = (entity: string, raw: string) => ENTITIES[entity].idIsInt ? Number(raw) : raw;

// Never echo `e.message` to a client: Prisma and Express messages can contain
// SQL, column names, constraint names and row data. Detail goes to the log.
function serverError(res: express.Response, e: unknown) {
  console.error('[api] unexpected error:', e);
  return res.status(500).json({ error: 'Internal server error' });
}

// Prisma client errors are the caller's fault and stay 4xx. The stable `code`
// (P2002, P2025, …) is safe to return and is what a client needs to react; the
// human-readable message is not.
function writeError(res: express.Response, e: any) {
  const code = typeof e?.code === 'string' && /^P\d{4}$/.test(e.code) ? e.code : undefined;
  if (!code) return serverError(res, e);
  console.warn('[api] rejected write:', code);
  if (code === 'P2025') return res.status(404).json({ error: 'Record not found', code });
  if (code === 'P2002') return res.status(409).json({ error: 'Duplicate value for a unique field', code });
  if (code === 'P2003') return res.status(409).json({ error: 'Related record does not exist', code });
  return res.status(400).json({ error: 'Invalid request', code });
}

// 405 with an accurate Allow header, so a client can tell "you may not write
// this" apart from "this collection does not exist".
function refuseWrite(res: express.Response, entity: string, reason: string) {
  return res.status(405).set('Allow', 'GET').json({ error: `${entity} is read-only`, reason });
}

app.get('/api/health', async (_req, res) => {
  try { await prisma.$queryRaw`SELECT 1`; res.json({ status: 'ok', db: 'up' }); }
  catch { res.status(503).json({ status: 'degraded', db: 'down' }); }
});

// Issue a fresh refresh session (row + cookie) and CSRF token for a user.
// The cookie carries "<sessionId>.<secret>"; only sha256(secret) is stored.
async function startSession(res: express.Response, user: { id: number }, familyId?: string) {
  const id = randomToken(16);
  const secret = randomToken(32);
  const family = familyId ?? randomToken(16);
  await prisma.refreshSession.create({
    data: {
      id,
      userId: user.id,
      tokenHash: sha256hex(secret),
      familyId: family,
      expiresAt: new Date(Date.now() + REFRESH_TTL_SECONDS * 1000),
    },
  });
  res.cookie(REFRESH_COOKIE, `${id}.${secret}`, refreshCookieOptions());
  const csrf = randomToken(24);
  res.cookie(CSRF_COOKIE, csrf, csrfCookieOptions());
  return csrf;
}

function issueAccess(user: { id: number; email: string; role: string; name: string }) {
  return signToken({ sub: user.id, email: user.email, role: user.role, name: user.name });
}

// Login — real credential check against the bcrypt user store. On success it
// returns a short-lived access JWT (in the body, for in-memory use) and sets a
// rotating HttpOnly refresh cookie plus a readable CSRF token.
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body ?? {};
    if (!email || !password) return res.status(401).json({ error: 'Invalid credentials' });
    const user = await prisma.user.findUnique({ where: { email: String(email) } });
    // Always run a compare (even when the user is missing) to blunt timing-based
    // account enumeration, then fail identically for "no user" and "bad password".
    const hash = user?.passwordHash ?? '$2a$10$0000000000000000000000000000000000000000000000000000';
    const ok = await bcrypt.compare(String(password), hash);
    if (!user || !user.isActive || !ok) return res.status(401).json({ error: 'Invalid credentials' });

    const token = issueAccess(user);
    const csrf = await startSession(res, user);
    res.json({
      user: { id: user.id, name: user.name, role: user.role, email: user.email },
      token, csrfToken: csrf, expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    });
  } catch (e) { serverError(res, e); }
});

// Refresh — rotate the refresh token and mint a new access token. Requires the
// Origin check + CSRF double-submit because it acts on a cookie. Reuse of an
// already-rotated token is treated as theft: the whole family is revoked.
app.post('/api/auth/refresh', async (req, res) => {
  try {
    if (!originOk(req)) return res.status(403).json({ error: 'Bad origin' });
    if (!csrfOk(req)) return res.status(403).json({ error: 'CSRF check failed' });

    const raw = req.cookies?.[REFRESH_COOKIE];
    if (!raw || typeof raw !== 'string' || !raw.includes('.')) {
      return res.status(401).json({ error: 'No refresh token' });
    }
    const [id, secret] = raw.split('.');
    const session = await prisma.refreshSession.findUnique({ where: { id } });
    if (!session || session.tokenHash !== sha256hex(secret ?? '')) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }
    if (session.revokedAt) {
      // A revoked (already-rotated) token was replayed → likely stolen. Burn the
      // whole rotation family so neither the attacker nor the victim can continue.
      await prisma.refreshSession.updateMany({
        where: { familyId: session.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return res.status(401).json({ error: 'Refresh token reuse detected' });
    }
    if (session.expiresAt < new Date()) return res.status(401).json({ error: 'Refresh token expired' });

    const user = await prisma.user.findUnique({ where: { id: session.userId } });
    if (!user || !user.isActive) return res.status(401).json({ error: 'User inactive' });

    // Rotate: revoke the presented session, start a new one in the same family.
    await prisma.refreshSession.update({ where: { id }, data: { revokedAt: new Date() } });
    const csrf = await startSession(res, user, session.familyId);
    res.json({
      user: { id: user.id, name: user.name, role: user.role, email: user.email },
      token: issueAccess(user), csrfToken: csrf, expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    });
  } catch (e) { serverError(res, e); }
});

// Logout — revoke the current refresh session and clear the cookies.
app.post('/api/auth/logout', async (req, res) => {
  try {
    const raw = req.cookies?.[REFRESH_COOKIE];
    if (typeof raw === 'string' && raw.includes('.')) {
      const [id] = raw.split('.');
      await prisma.refreshSession.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
    res.clearCookie(CSRF_COOKIE, { path: '/' });
    res.status(204).end();
  } catch (e) { serverError(res, e); }
});

// Who am I — cheap way for the SPA to confirm its access token is still valid.
app.get('/api/auth/me', requireAuth, (req, res) => {
  const u = req.user!;
  res.json({ user: { id: u.sub, name: u.name, role: u.role, email: u.email } });
});

// Every route below requires a valid token. Health and login stay public.

// One call hydrates the whole app.
app.get('/api/bootstrap', requireAuth, async (_req, res) => {
  try {
    const [departments, units, positions, employees, contracts, credentialCategories,
      credentialTemplates, credentialRequirements, credentials, shiftAssignments, notifications, auditEntries] =
      await Promise.all([
        prisma.department.findMany(), prisma.unit.findMany(), prisma.position.findMany(),
        prisma.employee.findMany(), prisma.contract.findMany(), prisma.credentialCategory.findMany(),
        prisma.credentialTemplate.findMany(), prisma.credentialRequirement.findMany(), prisma.credential.findMany(),
        prisma.shiftAssignment.findMany(), prisma.notification.findMany(), prisma.auditEntry.findMany(),
      ]);
    res.json({ departments, units, positions, employees, contracts, credentialCategories, credentialTemplates, credentialRequirements, credentials, shiftAssignments, notifications, auditEntries });
  } catch (e) { serverError(res, e); }
});

// Generic CRUD for every registered entity. Reads are open to any collection in
// the registry; writes are refused for anything marked readOnly.
app.get('/api/:entity', requireAuth, async (req, res) => {
  const cfg = entityConfig(req.params.entity);
  if (!cfg) return res.status(404).json({ error: 'Unknown entity' });
  try { res.json(await cfg.model.findMany()); } catch (e) { serverError(res, e); }
});

app.post('/api/:entity', requireAuth, requireRole(...WRITE_ROLES), async (req, res) => {
  const cfg = entityConfig(req.params.entity);
  if (!cfg) return res.status(404).json({ error: 'Unknown entity' });
  if (cfg.readOnly) return refuseWrite(res, req.params.entity, cfg.readOnly);
  try { res.status(201).json(await cfg.model.create({ data: req.body })); }
  catch (e) { writeError(res, e); }
});

app.put('/api/:entity/:id', requireAuth, requireRole(...WRITE_ROLES), async (req, res) => {
  const cfg = entityConfig(req.params.entity);
  if (!cfg) return res.status(404).json({ error: 'Unknown entity' });
  if (cfg.readOnly) return refuseWrite(res, req.params.entity, cfg.readOnly);
  try {
    const { id, ...data } = req.body;
    res.json(await cfg.model.update({ where: { [cfg.idField]: coerceId(req.params.entity, req.params.id) }, data }));
  } catch (e) { writeError(res, e); }
});

app.delete('/api/:entity/:id', requireAuth, requireRole(...WRITE_ROLES), async (req, res) => {
  const cfg = entityConfig(req.params.entity);
  if (!cfg) return res.status(404).json({ error: 'Unknown entity' });
  if (cfg.readOnly) return refuseWrite(res, req.params.entity, cfg.readOnly);
  try {
    await cfg.model.delete({ where: { [cfg.idField]: coerceId(req.params.entity, req.params.id) } });
    res.status(204).end();
  } catch (e) { writeError(res, e); }
});

const port = Number(process.env.PORT) || 3001;
app.listen(port, () => console.log(`AIGH API listening on http://localhost:${port}`));
