import { IsUUID, IsEnum, IsArray, IsOptional, IsString, MinLength, IsDateString, ArrayNotEmpty, IsNotEmpty } from 'class-validator';
import { AppRole, ScopeType } from '@prisma/client';

export class GrantRoleDto {
  @IsUUID()
  userId: string;

  @IsEnum(AppRole)
  role: AppRole; // HR_ADMIN, SUPERVISOR, SYSTEM_ADMIN (SYSTEM_ADMIN triggers Four-Eyes)

  @IsEnum(ScopeType)
  scopeType: ScopeType;

  @IsArray()
  @IsUUID('4', { each: true })
  scopeIds: string[]; // [] for SYSTEM, must be within granter's scope

  @IsString()
  @MinLength(20, { message: 'Reason must be >=20 chars — explicit justification required §8' })
  @IsNotEmpty()
  reason: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string; // optional, for ACTING_HEAD temporary, max 90 days enforced in service
}

export class RevokeRoleDto {
  @IsString()
  @MinLength(10)
  @IsNotEmpty()
  reason: string;
}

export class UpdateRoleDto {
  @IsOptional()
  @IsEnum(ScopeType)
  scopeType?: ScopeType;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  scopeIds?: string[];

  @IsOptional()
  @IsString()
  @MinLength(20)
  reason?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class ApproveDto {
  @IsString()
  @MinLength(5)
  reason: string;
}
