import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Headers,
  UseGuards,
  Req,
  HttpCode,
} from '@nestjs/common';
import { RoleMatrixService } from './roles.service';
import { GrantRoleDto, UpdateRoleDto, RevokeRoleDto, ApproveDto } from './dto/grant-role.dto';
import { RequireRole } from '../../common/decorators/require-role.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AdminApprovalService } from '../admin-approval/admin-approval.service';
import { PamService } from '../pam/pam.service';
import { AppRole, ScopeType } from '@prisma/client';

// Mock JwtAuthGuard for demo — in real app, validates HttpOnly cookie nurseapp_refresh SameSite=Lax + CSRF guard order B-03 B-04
class JwtAuthGuard {
  canActivate() {
    return true;
  }
}

@Controller('api/v1/roles')
@UseGuards(JwtAuthGuard as any, RolesGuard)
export class RolesController {
  constructor(
    private rolesService: RoleMatrixService,
    private approvalService: AdminApprovalService,
    private pamService: PamService,
  ) {}

  // GET /api/v1/roles/matrix — static matrix §8.1 + §8.2, public to authenticated
  @Get('matrix')
  async getMatrix() {
    // In real app, this would be static JSON from spec, not DB
    return {
      appRoles: [
        { role: 'SYSTEM_ADMIN', scope: 'System-wide', desc: 'Full admin, PAM, break-glass root, dormant JIT 2h' },
        { role: 'HR_ADMIN', scope: 'Scoped or system-wide', desc: 'Onboarding V36, dept/unit/bed CRUD, positions CRUD, credential catalog, contracts lifecycle' },
        { role: 'SUPERVISOR', scope: 'Assigned units', desc: 'Baseline/compliance view no evidence downloads, draft+publish roster, waivers 72h' },
        { role: 'EMPLOYEE', scope: 'Personal', desc: 'Own profile, own credentials, published personal/home-unit view' },
      ],
      accessMatrix: [
        { area: 'Accounts', hrAdmin: 'Provision within scope', supervisor: 'No admin', employee: 'Claim invited' },
        // ... full matrix omitted for brevity, see ROLE_MATRIX.md
      ],
      positionMapping: [
        { code: 'DON', title: 'Director of Nursing', tier: 'Executive', schedulable: false, defaultAuth: 'Staff self-service', elevated: 'HR Admin system-wide' },
        { code: 'NS', title: 'Nursing Supervisor', tier: 'Management', schedulable: true, defaultAuth: 'Staff self-service', elevated: 'Supervisor multi-unit', note: 'NS = Nursing Supervisor, not Nurse Specialist F-26' },
        // ... 14 positions
      ],
    };
  }

  @Get('me')
  async getMe(@Req() req: any) {
    return this.rolesService.getMe(req.user.id);
  }

  @Get('assignments')
  @RequireRole(AppRole.HR_ADMIN, AppRole.SYSTEM_ADMIN)
  async list(
    @Query('userId') userId?: string,
    @Query('role') role?: AppRole,
    @Query('scopeType') scopeType?: ScopeType,
    @Query('isActive') isActive?: string,
    @Query('unitId') unitId?: string,
    @Req() req?: any,
  ) {
    return this.rolesService.list(
      {
        userId,
        role,
        scopeType,
        isActive: isActive ? isActive === 'true' : undefined,
        unitId,
      },
      req.user,
    );
  }

  @Get('assignments/:id')
  @RequireRole(AppRole.HR_ADMIN, AppRole.SYSTEM_ADMIN)
  async getOne(@Param('id') id: string, @Req() req: any) {
    const all = await this.rolesService.list({ isActive: undefined } as any, req.user);
    return all.find((a: any) => a.id === id);
  }

  @Post('assignments')
  @RequireRole(AppRole.HR_ADMIN, AppRole.SYSTEM_ADMIN)
  @HttpCode(201)
  async grant(@Body() dto: GrantRoleDto, @Req() req: any, @Headers('idempotency-key') idempotencyKey: string) {
    // Idempotency-Key required per B-08
    return this.rolesService.grant(dto, req.user, idempotencyKey);
  }

  @Patch('assignments/:id')
  @RequireRole(AppRole.HR_ADMIN, AppRole.SYSTEM_ADMIN)
  async update(@Param('id') id: string, @Body() dto: UpdateRoleDto, @Req() req: any) {
    return this.rolesService.update(id, dto, req.user);
  }

  @Delete('assignments/:id')
  @RequireRole(AppRole.HR_ADMIN, AppRole.SYSTEM_ADMIN)
  async revoke(@Param('id') id: string, @Body() dto: RevokeRoleDto, @Req() req: any) {
    return this.rolesService.revoke(id, dto, req.user);
  }

  // Four-Eyes approval endpoints — §3.5 V42
  @Get('/../admin/approvals')
  @RequireRole(AppRole.HR_ADMIN, AppRole.SYSTEM_ADMIN)
  async listPending() {
    return this.approvalService.listPending();
  }

  @Post('/../admin/approvals/:requestId/approve')
  @RequireRole(AppRole.SYSTEM_ADMIN, AppRole.HR_ADMIN)
  async approve(@Param('requestId') requestId: string, @Body() dto: ApproveDto, @Req() req: any) {
    return this.approvalService.approve(requestId, req.user.id, dto.reason, async tx => {
      // Re-execute original grant payload in same transaction
      const original = await tx.adminApprovalRequest.findUnique({ where: { id: requestId } });
      const payload = original?.payload as any;
      if (!payload) throw new Error('Payload missing');

      // Check duplicate again inside tx
      const dup = await tx.userRoleAssignment.findFirst({
        where: { userId: payload.userId, role: payload.role, scopeType: payload.scopeType, isActive: true, revokedAt: null },
      });
      if (dup) throw new Error('Duplicate assignment');

      const created = await tx.userRoleAssignment.create({
        data: {
          userId: payload.userId,
          role: payload.role,
          scopeType: payload.scopeType,
          scopeIds: payload.scopeIds,
          grantedBy: original.initiatorId,
          reason: payload.reason,
          expiresAt: payload.expiresAt ? new Date(payload.expiresAt) : null,
          approvalRequestId: requestId,
        },
      });

      return created;
    });
  }

  @Post('/../admin/approvals/:requestId/reject')
  @RequireRole(AppRole.SYSTEM_ADMIN, AppRole.HR_ADMIN)
  async reject(@Param('requestId') requestId: string, @Body() dto: ApproveDto, @Req() req: any) {
    return this.approvalService.reject(requestId, req.user.id, dto.reason);
  }

  // PAM — §3.5 V42
  @Post('/../admin/pam/elevate')
  @RequireRole(AppRole.SYSTEM_ADMIN)
  async elevate(@Body() body: { reason: string; durationHrs?: number }, @Req() req: any) {
    return this.pamService.requestElevation(req.user.id, body.reason, body.durationHrs || 2);
  }

  @Get('/../admin/pam/status')
  @RequireRole(AppRole.SYSTEM_ADMIN)
  async pamStatus(@Req() req: any) {
    const isElevated = await this.pamService.isElevated(req.user.id);
    return { isElevated };
  }
}
