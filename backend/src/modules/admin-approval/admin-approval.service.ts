import { Injectable, ForbiddenException, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class AdminApprovalService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  // Initiate approval — called from RoleMatrixService when high-impact
  async initiate(data: { initiatorId: string; actionType: string; payload: any }) {
    // Partial unique index uq_admin_request_pending prevents duplicate PENDING
    try {
      const req = await this.prisma.adminApprovalRequest.create({
        data: {
          initiatorId: data.initiatorId,
          actionType: data.actionType,
          payload: data.payload,
          status: 'PENDING',
        },
      });
      await this.audit.log({
        action: 'APPROVAL_INITIATED',
        actorId: data.initiatorId,
        new: { actionType: data.actionType, payload: data.payload, requestId: req.id },
      });
      return req;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Pending approval already exists for this action');
      }
      throw e;
    }
  }

  // Approve — SELECT FOR UPDATE locks row so two approvers cannot both proceed
  async approve(requestId: string, approverId: string, reason: string, executeAction: (tx: Prisma.TransactionClient) => Promise<any>) {
    return this.prisma.$transaction(async tx => {
      const req = await tx.$queryRaw<any[]>`
        SELECT * FROM admin_approval_requests WHERE id = ${requestId}::uuid FOR UPDATE
      `.then(rows => rows[0]);

      if (!req) throw new NotFoundException('Approval request not found');
      if (req.status !== 'PENDING') throw new ConflictException(`Request already ${req.status}`);
      if (req.initiator_id === approverId) throw new ForbiddenException('Self-approval forbidden 403');

      // PENDING precondition blocks replay/re-approval
      const updated = await tx.adminApprovalRequest.update({
        where: { id: requestId },
        data: { approverId, status: 'APPROVED', decidedAt: new Date() },
      });

      // executeAction(tx,...) same transaction client so failure rolls back both action+status change
      let result;
      try {
        result = await executeAction(tx);
      } catch (e) {
        // rollback approval to PENDING? Actually transaction will rollback both, so we need to handle outside?
        // For simplicity, we let transaction rollback and throw
        throw e;
      }

      await tx.adminApprovalRequest.update({
        where: { id: requestId },
        data: { status: 'EXECUTED', executedAt: new Date() },
      });

      await this.audit.logTx(tx, {
        action: 'APPROVAL_EXECUTED',
        actorId: approverId,
        targetId: req.initiator_id,
        old: { requestId, actionType: req.action_type },
        new: { approverId, result, reason },
      });

      return { approval: updated, result };
    });
  }

  async reject(requestId: string, approverId: string, reason: string) {
    const req = await this.prisma.adminApprovalRequest.findUnique({ where: { id: requestId } });
    if (!req) throw new NotFoundException();
    if (req.status !== 'PENDING') throw new ConflictException(`Already ${req.status}`);
    if (req.initiatorId === approverId) throw new ForbiddenException('Self-approval forbidden');

    const updated = await this.prisma.adminApprovalRequest.update({
      where: { id: requestId },
      data: { approverId, status: 'REJECTED', decidedAt: new Date() },
    });

    await this.audit.log({
      action: 'APPROVAL_REJECTED',
      actorId: approverId,
      targetId: req.initiatorId,
      old: req as any,
      new: { reason },
    });

    return updated;
  }

  async listPending(scopeUserId?: string) {
    // In real implementation, filter by scope of scopeUserId
    return this.prisma.adminApprovalRequest.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    });
  }
}
