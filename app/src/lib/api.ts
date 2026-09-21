// Backend API client. Active only when VITE_API_URL is set; otherwise the app
// runs fully standalone on its built-in seed data (mock store).

const BASE = (import.meta as any).env?.VITE_API_URL as string | undefined;

export const API_ENABLED = !!BASE;

// The access token (a signed JWT, 15 min) is held in memory only — never in
// localStorage — so injected script cannot read it back and it clears when the
// tab closes. The CSRF token is kept alongside it to echo on refresh/logout.
// The long-lived refresh token lives in an HttpOnly cookie the server manages;
// JS never sees it, which is the whole point.
let authToken: string | null = null;
let csrfToken: string | null = null;
export const setAuthToken = (t: string | null) => { authToken = t; };
export const getAuthToken = () => authToken;
export const setCsrfToken = (t: string | null) => { csrfToken = t; };

// Read the (non-HttpOnly) CSRF cookie so the double-submit header can be sent
// even after a reload, when the in-memory copy is gone. The refresh cookie is
// HttpOnly and never readable here — only this CSRF value is.
function readCsrfCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(/(?:^|;\s*)nurseapp_csrf=([^;]*)/);
  return m ? decodeURIComponent(m[1]) : null;
}

async function raw(path: string, init?: RequestInit) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  const csrf = csrfToken || readCsrfCookie();
  if (csrf) headers['X-CSRF-Token'] = csrf;
  return fetch(`${BASE}${path}`, {
    ...init,
    credentials: 'include', // send/receive the HttpOnly refresh + CSRF cookies
    headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) },
  });
}

async function req(path: string, init?: RequestInit, _retried = false): Promise<any> {
  // Standalone mode: there is no backend to talk to. Short-circuiting here —
  // rather than letting `${BASE}${path}` build "undefined/api/…" — is what keeps
  // the demo from issuing bogus requests and, under Node, from dying on an
  // unhandled rejection. syncWrite's own guard cannot do this job: JavaScript
  // evaluates `syncWrite(api.create(…))`'s argument first, so the request is
  // already in flight by the time syncWrite decides to do nothing.
  if (!API_ENABLED) return null;
  let res = await raw(path, init);
  // Access token expired mid-session → try one silent refresh, then retry once.
  if (res.status === 401 && !_retried && !path.startsWith('/api/auth/')) {
    const refreshed = await tryRefresh();
    if (refreshed) return req(path, init, true);
  }
  if (!res.ok) throw new Error(`API ${res.status} ${path}`);
  return res.status === 204 ? null : res.json();
}

// Exchange the HttpOnly refresh cookie for a new access token. Returns true on
// success. Never throws — callers treat failure as "session over".
//
// Single-flight: concurrent callers share one in-flight request. Refresh
// ROTATES the token server-side, so two parallel refreshes would present the
// same cookie and the second would look like a replay — tripping the server's
// reuse detection and burning the whole session family. React StrictMode's
// double-invoked mount effect and racing 401s both hit this, so dedupe here.
let refreshInFlight: Promise<boolean> | null = null;
function tryRefresh(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const res = await raw('/api/auth/refresh', { method: 'POST' });
      if (!res.ok) return false;
      const r = await res.json();
      if (r?.token) setAuthToken(r.token);
      if (r?.csrfToken) setCsrfToken(r.csrfToken);
      return !!r?.token;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

export const api = {
  enabled: API_ENABLED,
  bootstrap: () => req('/api/bootstrap'),
  // Log in, then keep the returned access + CSRF tokens for subsequent calls.
  login: async (email: string, password: string) => {
    const res = await raw('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    if (!res.ok) throw new Error(`API ${res.status} /api/auth/login`);
    const r = await res.json();
    if (r?.token) setAuthToken(r.token);
    if (r?.csrfToken) setCsrfToken(r.csrfToken);
    return r;
  },
  refresh: tryRefresh,
  me: () => req('/api/auth/me'),
  logout: async () => {
    if (API_ENABLED) { try { await raw('/api/auth/logout', { method: 'POST' }); } catch { /* best effort */ } }
    setAuthToken(null);
    setCsrfToken(null);
  },
  create: (entity: string, data: any) => req(`/api/${entity}`, { method: 'POST', body: JSON.stringify(data) }),
  update: (entity: string, id: number | string, data: any) => req(`/api/${entity}/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  remove: (entity: string, id: number | string) => req(`/api/${entity}/${id}`, { method: 'DELETE' }),
};

// Fire-and-forget write with a console warning on failure — keeps the UI
// optimistic and responsive while still persisting to the database.
export function syncWrite(p: Promise<any>) {
  // The handler is attached unconditionally. Returning early when the API is
  // disabled would leave the promise unhandled, and an unhandled rejection
  // terminates a Node process (which is how `npm test` used to die) and logs
  // noise in the browser.
  p.catch((e) => {
    if (API_ENABLED) console.warn('[api] write failed (kept local):', e?.message ?? e);
  });
}
