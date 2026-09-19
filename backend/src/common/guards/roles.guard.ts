import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRE_ROLE_KEY } from '../decorators/require-role.decorator';
import { AppRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector, private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<AppRole[]>(REQUIRE_ROLE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user; // set by JwtAuthGuard, contains id

    if (!user) throw new ForbiddenException('Not authenticated');

    // Fresh DB read — never trust Redis for auth decisions (§8.1 cache safety)
    const assignments = await this.prisma.userRoleAssignment.findMany({
      where: { userId: user.id, isActive: true, revokedAt: null },
    });

    // EMPLOYEE is implicit default — always present
    const effectiveRoles: AppRole[] = ['EMPLOYEE' as AppRole, ...assignments.map(a => a.role)];

    const hasRole = requiredRoles.some(r => effectiveRoles.includes(r));
    if (!hasRole) throw new ForbiddenException(`Requires role: ${requiredRoles.join(',')}`);

    // For SYSTEM_ADMIN, check PAM elevation (§3.5, V42)
    if (effectiveRoles.includes('SYSTEM_ADMIN' as AppRole)) {
      const pam = await this.prisma.privilegedSession.findUnique({ where: { userId: user.id } });
      if (!pam || pam.expiresAt < new Date()) {
        // Dormant by default — must request elevation
        throw new ForbiddenException('SYSTEM_ADMIN requires active PAM elevation — request via POST /api/v1/admin/pam/elevate');
      }
    }

    // Attach effective roles + assignments to request for scope checks in service
    request.effectiveRoles = effectiveRoles;
    request.roleAssignments = assignments;

    return true;
  }
}
