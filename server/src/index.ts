import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || true, credentials: true }));
app.use(express.json({ limit: '5mb' }));

// Entity registry — url segment -> { delegate, idField, idIsInt }.
// One generic set of handlers covers every table so the API stays small.
const ENTITIES: Record<string, { model: any; idField: string; idIsInt: boolean }> = {
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
  notifications:          { model: prisma.notification,         idField: 'id',   idIsInt: true },
  'audit-entries':        { model: prisma.auditEntry,           idField: 'id',   idIsInt: true },
};

const coerceId = (entity: string, raw: string) => ENTITIES[entity].idIsInt ? Number(raw) : raw;

app.get('/api/health', async (_req, res) => {
  try { await prisma.$queryRaw`SELECT 1`; res.json({ status: 'ok', db: 'up' }); }
  catch { res.status(503).json({ status: 'degraded', db: 'down' }); }
});

// Mock auth matching the frontend's demo accounts.
app.post('/api/auth/login', (req, res) => {
  const { email } = req.body ?? {};
  if (!email || !String(email).includes('@')) return res.status(401).json({ error: 'Invalid credentials' });
  const e = String(email);
  const role = e.includes('hr') ? 'HR_ADMIN' : e.includes('admin') ? 'SYSTEM_ADMIN' : e.includes('supervisor') ? 'SUPERVISOR' : 'EMPLOYEE';
  res.json({ user: { id: 1, name: e.split('@')[0], role, email: e }, token: 'demo-' + Math.random().toString(36).slice(2) });
});

// One call hydrates the whole app.
app.get('/api/bootstrap', async (_req, res) => {
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
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Generic CRUD for every registered entity.
app.get('/api/:entity', async (req, res) => {
  const cfg = ENTITIES[req.params.entity];
  if (!cfg) return res.status(404).json({ error: 'Unknown entity' });
  try { res.json(await cfg.model.findMany()); } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/:entity', async (req, res) => {
  const cfg = ENTITIES[req.params.entity];
  if (!cfg) return res.status(404).json({ error: 'Unknown entity' });
  try { res.status(201).json(await cfg.model.create({ data: req.body })); }
  catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.put('/api/:entity/:id', async (req, res) => {
  const cfg = ENTITIES[req.params.entity];
  if (!cfg) return res.status(404).json({ error: 'Unknown entity' });
  try {
    const { id, ...data } = req.body;
    res.json(await cfg.model.update({ where: { [cfg.idField]: coerceId(req.params.entity, req.params.id) }, data }));
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.delete('/api/:entity/:id', async (req, res) => {
  const cfg = ENTITIES[req.params.entity];
  if (!cfg) return res.status(404).json({ error: 'Unknown entity' });
  try {
    await cfg.model.delete({ where: { [cfg.idField]: coerceId(req.params.entity, req.params.id) } });
    res.status(204).end();
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

const port = Number(process.env.PORT) || 3001;
app.listen(port, () => console.log(`AIGH API listening on http://localhost:${port}`));
