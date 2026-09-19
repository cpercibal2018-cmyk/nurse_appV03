// src/common/idempotency/idempotency.guard.ts
// B-08 — lease-aware idempotency guard (Section 9.5).
//
// Changes from the reviewed baseline:
//   * Processing lease: a crashed request can no longer block a key for 24h.
//     A 409 is returned only while the previous attempt's lease is still live;
//     once it lapses, this request retakes the key.
//   * Response bodies are no longer replayed verbatim (see the interceptor).

import {
  BadRequestException,
  CanActivate,
  ConflictException,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SetMetadata } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { createHash } from 'node:crypto';

export const IDEMPOTENT = 'idempotent';
export const Idempotent = (operation: string) => SetMetadata(IDEMPOTENT, operation);

/** How long a single attempt may hold a key before another request may retake it. */
export const PROCESSING_LEASE_MS = 5 * 60 * 1000; // 5 minutes

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class IdempotencyGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const operation = this.reflector.get<string>(IDEMPOTENT, context.getHandler());
    if (!operation) return true;

    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();

    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return true;

    const idempotencyKey = req.headers['idempotency-key'];
    if (!idempotencyKey) {
      throw new BadRequestException(
        `Idempotency-Key header is required for ${operation} operations`,
      );
    }
    if (!UUID_V4.test(idempotencyKey)) {
      throw new BadRequestException('Idempotency-Key must be a valid UUID v4');
    }

    const actorId = req.user?.id;
    if (!actorId) return true; // AuthGuard will reject; CSRF/ordering handled at controller level

    const existing = await this.prisma.idempotencyKey.findUnique({
      where: { key_actorId: { key: idempotencyKey, actorId } },
    });

    if (existing) {
      if (existing.expiresAt < new Date()) {
        await this.prisma.idempotencyKey.delete({ where: { id: existing.id } });
      } else if (existing.status === 'COMPLETED') {
        res.setHeader('Idempotency-Replayed', 'true');
        res.status(existing.responseCode ?? 200).json(existing.responseBody ?? {});
        return false; // short-circuit — handler does not run
      } else if (existing.status === 'PROCESSING') {
        const leaseLive =
          existing.processingLeaseExpiresAt != null &&
          existing.processingLeaseExpiresAt > new Date();

        if (leaseLive) {
          throw new ConflictException({
            message: 'A request with this idempotency key is already being processed',
            retryAfter: 2,
          });
        }
        // Lease lapsed (the previous attempt crashed) — fall through and retake it.
      }
      // FAILED — fall through and retry.
    }

    const requestHash = this.hashBody(req.body);
    await this.prisma.idempotencyKey.upsert({
      where: { key_actorId: { key: idempotencyKey, actorId } },
      create: {
        key: idempotencyKey,
        actorId,
        operation,
        requestPath: req.originalUrl,
        requestHash,
        status: 'PROCESSING',
        processingLeaseExpiresAt: new Date(Date.now() + PROCESSING_LEASE_MS),
      },
      update: {
        status: 'PROCESSING',
        requestHash,
        requestPath: req.originalUrl,
        processingLeaseExpiresAt: new Date(Date.now() + PROCESSING_LEASE_MS),
      },
    });

    req.idempotencyKey = idempotencyKey;
    req.idempotencyOperation = operation;
    return true;
  }

  private hashBody(body: unknown): string {
    return createHash('sha256')
      .update(JSON.stringify(body ?? {}))
      .digest('hex');
  }
}
