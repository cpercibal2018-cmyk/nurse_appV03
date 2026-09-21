// Backend API client. Active only when VITE_API_URL is set; otherwise the app
// runs fully standalone on its built-in seed data (mock store).

const BASE = (import.meta as any).env?.VITE_API_URL as string | undefined;

export const API_ENABLED = !!BASE;

async function req(path: string, init?: RequestInit) {
  // Standalone mode: there is no backend to talk to. Short-circuiting here —
  // rather than letting `${BASE}${path}` build "undefined/api/…" — is what keeps
  // the demo from issuing bogus requests and, under Node, from dying on an
  // unhandled rejection. syncWrite's own guard cannot do this job: JavaScript
  // evaluates `syncWrite(api.create(…))`'s argument first, so the request is
  // already in flight by the time syncWrite decides to do nothing.
  if (!API_ENABLED) return null;
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) throw new Error(`API ${res.status} ${path}`);
  return res.status === 204 ? null : res.json();
}

export const api = {
  enabled: API_ENABLED,
  bootstrap: () => req('/api/bootstrap'),
  login: (email: string, password: string) => req('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
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
