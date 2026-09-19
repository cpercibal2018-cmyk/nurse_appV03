// src/common/idempotency/idempotency.interceptor.ts
// B-08 — captures the result for replay.
//
// PRIVACY CHANGE (Section 8.3 / PDPL): the stored replay payload is reduced to
// resource identifiers. Storing the full response body would keep a second,
// unlogged copy of personal data (onboarding responses contain employee
// records) alive for 24 hours. `response_hash` is still computed over the full
// body, so integrity can be verified without retaining the content.

import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';

/** Only these keys are retained for replay — identifiers, never PII. */
const REPLAY_ID_KEYS = ['id', 'employeeId', 'invitationId', 'publicationId'] as const;

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();

    if (!req.idempotencyKey) return next.handle();

    return next.handle().pipe(
      tap((responseBody: any) => {
        void this.markCompleted(req, res, responseBody).catch(() => {
          /* non-fatal: the business operation already committed */
        });
      }),
      catchError((error) => {
        void this.markFailed(req, error).catch(() => undefined);
        return throwError(() => error);
      }),
    );
  }

  private minimalPayload(body: any): Record<string, unknown> {
    if (!body || typeof body !== 'object') return {};
    const out: Record<string, unknown> = {};
    for (const k of REPLAY_ID_KEYS) {
      if (body[k] !== undefined) out[k] = body[k];
    }
    return out;
  }

  private async markCompleted(req: any, res: any, body: any): Promise<void> {
    await this.prisma.idempotencyKey.update({
      where: {
        key_actorId: { key: req.idempotencyKey, actorId: req.user.id },
      },
      data: {
        status: 'COMPLETED',
        responseCode: res.statusCode,
        responseBody: this.minimalPayload(body),
        responseHash: createHash('sha256')
          .update(JSON.stringify(body ?? {}))
          .digest('hex'),
        completedAt: new Date(),
        processingLeaseExpiresAt: null,
      },
    });
  }

  private async markFailed(req: any, error: any): Promise<void> {
    await this.prisma.idempotencyKey.update({
      where: {
        key_actorId: { key: req.idempotencyKey, actorId: req.user.id },
      },
      data: {
        status: 'FAILED',
        responseCode: error?.status ?? 500,
        completedAt: new Date(),
        processingLeaseExpiresAt: null, // a later retry may retake the key
      },
    });
  }
}
