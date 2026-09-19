import { SetMetadata } from '@nestjs/common';
import { AppRole } from '@prisma/client';

export const REQUIRE_ROLE_KEY = 'requireRole';
export const RequireRole = (...roles: AppRole[]) => SetMetadata(REQUIRE_ROLE_KEY, roles);
