import { Module } from '@nestjs/common';
import { RoleMatrixService } from './roles.service';
import { RolesController } from './roles.controller';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RedisService } from '../redis/redis.service';
import { AdminApprovalService } from '../admin-approval/admin-approval.service';
import { PamService } from '../pam/pam.service';

@Module({
  controllers: [RolesController],
  providers: [RoleMatrixService, PrismaService, AuditService, RedisService, AdminApprovalService, PamService],
  exports: [RoleMatrixService],
})
export class RolesModule {}
