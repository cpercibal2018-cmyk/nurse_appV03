// backend/tests/csrf-guard-order.e2e-spec.ts
// B-04 — proves the guard ordering fix.
//
// The reviewed baseline registered CsrfGuard as a global APP_GUARD. NestJS runs
// global guards BEFORE controller-scoped guards, so req.user was undefined and
// every state-changing request was rejected with 403. This test fails on the
// old wiring and passes on the controller-level wiring.

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('CSRF guard ordering (e2e)', () => {
  let app: INestApplication;
  let accessToken: string;
  let csrfToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: process.env.E2E_USER ?? 'hr.admin', password: process.env.E2E_PASS ?? 'test-password' })
      .expect(200);

    accessToken = login.body.accessToken;
    csrfToken = login.body.csrfToken;

    // The refresh cookie must actually be set and usable across a reload.
    const cookies = login.headers['set-cookie'] as unknown as string[];
    expect(cookies.join(';')).toMatch(/nurseapp_refresh=/);
    expect(cookies.join(';')).not.toMatch(/__Host-refresh/);
  });

  afterAll(async () => {
    await app.close();
  });

  it('accepts a mutating request WITH the CSRF token (would 403 on the old wiring)', async () => {
    await request(app.getHttpServer())
      .put('/api/v1/units/bed-capacity/bulk')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('X-CSRF-Token', csrfToken)
      .set('Idempotency-Key', randomUuidV4())
      .send({ rows: [{ unitCode: 'ICU_MAIN', bedCount: 79 }], reason: 'e2e' })
      .expect((res) => expect([200, 201, 409]).toContain(res.status));
  });

  it('rejects a mutating request WITHOUT the CSRF token', async () => {
    await request(app.getHttpServer())
      .put('/api/v1/units/bed-capacity/bulk')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', randomUuidV4())
      .send({ rows: [{ unitCode: 'ICU_MAIN', bedCount: 80 }] })
      .expect(403);
  });

  it('rejects a mutating request from a foreign Origin', async () => {
    await request(app.getHttpServer())
      .put('/api/v1/units/bed-capacity/bulk')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('X-CSRF-Token', csrfToken)
      .set('Origin', 'https://evil.example')
      .set('Idempotency-Key', randomUuidV4())
      .send({ rows: [{ unitCode: 'ICU_MAIN', bedCount: 81 }] })
      .expect(403);
  });

  it('requires an Idempotency-Key on protected operations', async () => {
    await request(app.getHttpServer())
      .put('/api/v1/units/bed-capacity/bulk')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('X-CSRF-Token', csrfToken)
      .send({ rows: [{ unitCode: 'ICU_MAIN', bedCount: 82 }] })
      .expect(400);
  });

  it('refresh works after a simulated page reload (cookie, no body token)', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: process.env.E2E_USER ?? 'hr.admin', password: process.env.E2E_PASS ?? 'test-password' })
      .expect(200);

    const cookie = (login.headers['set-cookie'] as unknown as string[])[0].split(';')[0];

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookie)
      .expect(200)
      .expect((res) => {
        expect(res.body.accessToken).toBeDefined();
        expect(res.body.csrfToken).toBeDefined();
      });
  });
});

function randomUuidV4(): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('node:crypto').randomUUID();
}
