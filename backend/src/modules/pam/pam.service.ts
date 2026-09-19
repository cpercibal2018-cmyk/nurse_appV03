import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class PamService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  // isElevated() checks expiry revokes if expired (§3.5 V42)
  async isElevated(userId: string): Promise<boolean> {
    const session = await this.prisma.privilegedSession.findUnique({ where: { userId } });
    if (!session) return false;
    if (session.expiresAt < new Date()) {
      // auto-revoke
      await this.prisma.privilegedSession.delete({ where: { userId } }).catch(() => {});
      await this.audit.log({ action: 'PAM_AUTO_REVOKED', actorId: userId, targetId: userId });
      return false;
    }
    return true;
  }

  // requestElevation() upsert expires_at now+durationHrs*3600000 reason
  async requestElevation(userId: string, reason: string, durationHrs = 2, authorizedBy?: string) {
    if (!reason || reason.length < 10) throw new ForbiddenException('Reason required >=10 chars');
    if (durationHrs < 1 || durationHrs > 4) throw new ForbiddenException('Duration must be 1-4h');

    const expiresAt = new Date(Date.now() + durationHrs * 3600 * 1000);

    const session = await this.prisma.privilegedSession.upsert({
      where: { userId },
      update: { expiresAt, reason, authorizedBy },
      create: { userId, expiresAt, reason, authorizedBy },
    });

    await this.audit.log({
      action: 'PAM_ELEVATED',
      actorId: userId,
      targetId: userId,
      new: { expiresAt, reason, durationHrs },
    });

    return session;
  }

  async revoke(userId: string, actorId: string) {
    await this.prisma.privilegedSession.delete({ where: { userId } }).catch(() => {});
    await this.audit.log({ action: 'PAM_REVOKED', actorId, targetId: userId });
  }
}

// Worker: PamExpiryWorker — runs every minute, revokes expired sessions
// @Injectable() export class PamExpiryWorker { @Cron('*/1 * * * *') async handle() { ... } }
