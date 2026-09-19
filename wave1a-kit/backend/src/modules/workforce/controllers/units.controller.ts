// src/modules/workforce/controllers/units.controller.ts
// B-24 — unit and bed-capacity configuration endpoints (Section 2.9).
//
// Guard order matters (B-04): authenticate → authorize → CSRF. Registering
// CsrfGuard as a global APP_GUARD would run it BEFORE the auth guard, leaving
// req.user undefined and rejecting every mutating request.

import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../../identity/guards/auth.guard';
import { RbacGuard, RequireRole } from '../../identity/guards/rbac.guard';
import { CsrfGuard } from '../../identity/guards/csrf.guard';
import { IdempotencyGuard, Idempotent } from '../../../common/idempotency/idempotency.guard';
import { WorkforceService } from '../workforce.service';
import { WorkforceBulkCapacityService } from '../workforce-bulk-capacity.service';
import { BulkBedCapacityDto } from '../dto/bulk-bed-capacity.dto';
import { ImportUnitsDto } from '../dto/import-units.dto';

@Controller('api/v1/units')
@UseGuards(AuthGuard, RbacGuard, CsrfGuard) // order: authenticate, authorize, CSRF
export class UnitsController {
  constructor(
    private readonly workforceService: WorkforceService,
    private readonly bulkCapacity: WorkforceBulkCapacityService,
  ) {}

  @Get()
  async listUnits(
    @Query('departmentId') departmentId?: number,
    @Query('includeInactive') includeInactive?: boolean,
  ) {
    return this.workforceService.getUnits({ departmentId, includeInactive });
  }

  /** Live totals — powers the configuration grid and the "Baseline → Configured" display. */
  @Get('summary')
  async summary() {
    return this.bulkCapacity.summary();
  }

  // ── Batch configuration (B-24) ───────────────────────────────────────────

  @Put('bed-capacity/bulk')
  @Idempotent('bed_capacity_bulk')
  @RequireRole('HR_ADMIN', 'SYSTEM_ADMIN')
  @UseGuards(IdempotencyGuard)
  async bulkUpdateBedCapacity(@Body() dto: BulkBedCapacityDto, @Req() req) {
    return this.bulkCapacity.bulkUpdateBedCapacity(dto, req.user.id);
  }

  @Post('import')
  @Idempotent('units_import')
  @RequireRole('HR_ADMIN', 'SYSTEM_ADMIN')
  @UseGuards(IdempotencyGuard)
  async importUnits(@Body() dto: ImportUnitsDto, @Req() req) {
    // Dry-run by default; the client must send dryRun:false to apply.
    return this.bulkCapacity.importUnits(dto, req.user.id, dto.dryRun ?? true);
  }

  // ── Single-unit operations (unchanged) ───────────────────────────────────

  @Put(':id/bed-capacity')
  @RequireRole('HR_ADMIN', 'SYSTEM_ADMIN')
  async updateBedCapacity(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { bedCount: number; reason?: string },
    @Req() req,
  ) {
    return this.workforceService.updateBedCapacity(id, body, req.user.id);
  }

  @Get(':id/bed-history')
  @RequireRole('HR_ADMIN', 'SYSTEM_ADMIN', 'SUPERVISOR')
  async getBedHistory(@Param('id', ParseIntPipe) id: number) {
    return this.workforceService.getBedCapacityHistory(id);
  }
}
