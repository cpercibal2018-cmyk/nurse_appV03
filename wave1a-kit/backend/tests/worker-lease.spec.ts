// backend/tests/worker-lease.spec.ts
// B-10 — lease semantics. Requires TEST_DATABASE_URL (PostgreSQL 15) because
// the acquire path is a conditional upsert: the race guarantee lives in the
// database, not in application code.

import { PrismaClient } from '@prisma/client';
import { WorkerLeaseService } from '../src/common/worker-lease/worker-lease.service';

const describeDb = process.env.TEST_DATABASE_URL ? describe : describe.skip;

describeDb('WorkerLeaseService', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL! } } });
    await prisma.$executeRaw`TRUNCATE worker_leases`;
  });

  afterAll(async () => {
    await prisma.$executeRaw`TRUNCATE worker_leases`;
    await prisma.$disconnect();
  });

  const svc = () => new WorkerLeaseService(prisma as any);

  it('runs the job and releases the lease afterwards', async () => {
    const lease = svc();
    let ran = false;
    const acquired = await lease.withLease('test.job', 60, async () => { ran = true; });

    expect(acquired).toBe(true);
    expect(ran).toBe(true);

    const rows = await prisma.$queryRaw`SELECT count(*)::int AS n FROM worker_leases WHERE job_name = 'test.job'`;
    expect((rows as any)[0].n).toBe(0);
  });

  it('refuses a second live holder', async () => {
    const a = svc();
    const b = svc();
    let bRan = false;

    await a.withLease('test.contended', 60, async () => {
      const second = await b.withLease('test.contended', 60, async () => { bRan = true; });
      expect(second).toBe(false);
    });

    expect(bRan).toBe(false);
  });

  it('takes over an expired lease (crashed worker)', async () => {
    // Simulate a crashed holder: a lease already past its expiry.
    await prisma.$executeRaw`
      INSERT INTO worker_leases (job_name, holder_id, expires_at, lease_seconds)
      VALUES ('test.crashed', gen_random_uuid(), now() - interval '1 minute', 60)
      ON CONFLICT (job_name) DO UPDATE SET expires_at = now() - interval '1 minute'
    `;

    let ran = false;
    const acquired = await svc().withLease('test.crashed', 60, async () => { ran = true; });

    expect(acquired).toBe(true);
    expect(ran).toBe(true);
  });

  it('releases the lease even when the job throws', async () => {
    const lease = svc();
    await expect(
      lease.withLease('test.throwing', 60, async () => {
        throw new Error('job failed');
      }),
    ).rejects.toThrow('job failed');

    const rows = await prisma.$queryRaw`
      SELECT count(*)::int AS n FROM worker_leases WHERE job_name = 'test.throwing'
    `;
    expect((rows as any)[0].n).toBe(0);
  });

  it('does not delete another holder’s lease on release', async () => {
    await prisma.$executeRaw`
      INSERT INTO worker_leases (job_name, holder_id, expires_at, lease_seconds)
      VALUES ('test.foreign', gen_random_uuid(), now() + interval '10 minutes', 600)
      ON CONFLICT (job_name) DO UPDATE SET expires_at = now() + interval '10 minutes'
    `;

    // This instance cannot take the lease, so it must not clear the row.
    const acquired = await svc().withLease('test.foreign', 60, async () => undefined);
    expect(acquired).toBe(false);

    const rows = await prisma.$queryRaw`
      SELECT count(*)::int AS n FROM worker_leases WHERE job_name = 'test.foreign'
    `;
    expect((rows as any)[0].n).toBe(1);
  });
});
