import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import * as crypto from 'crypto';

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  // Hash-chained append-only §9.1
  private computeHash(prevHash: string | null, payload: any): string {
    const data = `${prevHash || ''}${JSON.stringify(payload)}`;
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  async log(params: {
    action: string;
    actorId: string;
    targetId?: string;
    old?: any;
    new?: any;
    requestId?: string;
  }) {
    const last = await this.prisma.auditEntry.findFirst({
      orderBy: { createdAt: 'desc' },
    });

    const entry = {
      actorId: params.actorId,
      action: params.action,
      targetId: params.targetId,
      oldValue: params.old || Prisma.JsonNull,
      newValue: params.new || Prisma.JsonNull,
      prevHash: last?.hash || null,
      hash: '', // computed below
    };

    entry.hash = this.computeHash(entry.prevHash, {
      action: entry.action,
      actorId: entry.actorId,
      targetId: entry.targetId,
      old: entry.oldValue,
      new: entry.newValue,
    });

    return this.prisma.auditEntry.create({ data: entry });
  }

  // Transactional version — must use same tx client so failure rolls back both action+audit
  async logTx(
    tx: Prisma.TransactionClient,
    params: { action: string; actorId: string; targetId?: string; old?: any; new?: any },
  ) {
    const last = await tx.auditEntry.findFirst({ orderBy: { createdAt: 'desc' } });
    const payload = {
      actorId: params.actorId,
      action: params.action,
      targetId: params.targetId,
      oldValue: params.old || Prisma.JsonNull,
      newValue: params.new || Prisma.JsonNull,
      prevHash: last?.hash || null,
      hash: '',
    };
    payload.hash = this.computeHash(payload.prevHash, {
      action: payload.action,
      actorId: payload.actorId,
      targetId: payload.targetId,
      old: payload.oldValue,
      new: payload.newValue,
    });
    return tx.auditEntry.create({ data: payload });
  }
}
