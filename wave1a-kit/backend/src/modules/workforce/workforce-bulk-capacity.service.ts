// src/modules/workforce/workforce-bulk-capacity.service.ts
// B-24 — bulk capacity update and CSV import (Section 2.9).
//
// Design notes:
//   * One transaction per batch. Partial success is reported per row, but every
//     applied change is committed atomically with its bed_capacity_log row.
//   * One log row per CHANGED unit (never a single summary row) so a full
//     re-baseline is individually traceable — actor, reason, before, after.
//   * The importer never deletes units; removal stays the guarded soft delete.
//   * Dry-run is the default for import.

import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  BulkBedCapacityDto,
  BulkRowResult,
} from './dto/bulk-bed-capacity.dto';
import {
  ImportRowResult,
  ImportUnitsDto,
  InvalidCsvHeaderError,
} from './dto/import-units.dto';

const MAX_BEDS = 500; // chk_bed_count_range
const REQUIRED_HEADER = ['unit_code', 'name', 'department_code', 'beds'];

interface ParsedRow {
  line: number;
  unitCode: string;
  name: string;
  departmentCode: string;
  beds: number;
  description?: string;
}

@Injectable()
export class WorkforceBulkCapacityService {
  private readonly logger = new Logger(WorkforceBulkCapacityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── Bulk capacity update ─────────────────────────────────────────────────

  async bulkUpdateBedCapacity(
    dto: BulkBedCapacityDto,
    actorId: number,
  ): Promise<BulkRowResult[]> {
    return this.prisma.$transaction(async (tx) => {
      const results: BulkRowResult[] = [];

      for (const row of dto.rows) {
        const unit = await tx.nursingUnit.findUnique({
          where: { code: row.unitCode },
        });

        if (!unit || unit.deletedAt) {
          results.push({
            unitCode: row.unitCode,
            status: 'REJECTED',
            reason: 'Unknown or deleted unit code',
          });
          continue;
        }
        if (!Number.isInteger(row.bedCount) || row.bedCount < 0 || row.bedCount > MAX_BEDS) {
          results.push({
            unitCode: row.unitCode,
            status: 'REJECTED',
            reason: `Bed count must be an integer between 0 and ${MAX_BEDS}`,
          });
          continue;
        }
        if (unit.bedCount === row.bedCount) {
          results.push({ unitCode: row.unitCode, status: 'UNCHANGED', next: row.bedCount });
          continue;
        }

        await tx.bedCapacityLog.create({
          data: {
            unitId: unit.id,
            previousCount: unit.bedCount,
            newCount: row.bedCount,
            reason: dto.reason ?? 'Bulk capacity configuration',
            changedBy: actorId,
          },
        });
        await tx.nursingUnit.update({
          where: { id: unit.id },
          data: { bedCount: row.bedCount, updatedAt: new Date() },
        });

        results.push({
          unitCode: row.unitCode,
          status: 'UPDATED',
          previous: unit.bedCount,
          next: row.bedCount,
        });
      }

      const changed = results.filter((r) => r.status === 'UPDATED').length;
      await this.audit.logDomainEvent(tx, {
        action: 'BED_CAPACITY_BULK_UPDATED',
        resource: 'nursing_units',
        resourceId: null,
        changes: {
          updated: changed,
          unchanged: results.filter((r) => r.status === 'UNCHANGED').length,
          rejected: results.filter((r) => r.status === 'REJECTED').length,
          reason: dto.reason ?? 'Bulk capacity configuration',
        },
      });

      this.logger.log(`Bulk capacity update: ${changed} unit(s) changed by actor ${actorId}`);
      return results;
    });
  }

  // ── CSV import ───────────────────────────────────────────────────────────

  async importUnits(
    dto: ImportUnitsDto,
    actorId: number,
    dryRun: boolean,
  ): Promise<{ dryRun: boolean; results: ImportRowResult[]; totalBeds: number }> {
    const parsed = this.parseCsv(dto.csv);

    // Resolve reference data once.
    const [departments, units] = await Promise.all([
      this.prisma.department.findMany({ where: { deletedAt: null } }),
      this.prisma.nursingUnit.findMany({ where: { deletedAt: null } }),
    ]);
    const deptByCode = new Map(departments.map((d) => [d.code, d]));
    const unitByCode = new Map(units.map((u) => [u.code, u]));

    const results: ImportRowResult[] = [];
    const seen = new Set<string>();
    let totalBeds = units.reduce((sum, u) => sum + u.bedCount, 0);

    for (const row of parsed.rows) {
      // Row-level validation
      if (seen.has(row.unitCode)) {
        results.push({ ...this.base(row), status: 'REJECTED', reason: 'Duplicate unit_code in file' });
        continue;
      }
      seen.add(row.unitCode);

      const dept = deptByCode.get(row.departmentCode);
      if (!dept) {
        results.push({
          ...this.base(row),
          status: 'REJECTED',
          reason: `Unknown department_code ${row.departmentCode}`,
        });
        continue;
      }
      if (!Number.isInteger(row.beds) || row.beds < 0 || row.beds > MAX_BEDS) {
        results.push({
          ...this.base(row),
          status: 'REJECTED',
          reason: `beds must be 0–${MAX_BEDS}`,
        });
        continue;
      }

      const existing = unitByCode.get(row.unitCode);
      if (existing) {
        if (existing.bedCount === row.beds && existing.name === row.name) {
          results.push({ ...this.base(row), status: 'UNCHANGED' });
        } else {
          totalBeds += row.beds - existing.bedCount;
          results.push({ ...this.base(row), status: 'UPDATED' });
        }
      } else {
        totalBeds += row.beds;
        results.push({ ...this.base(row), status: 'CREATED' });
      }
    }

    if (dryRun) {
      return { dryRun: true, results, totalBeds };
    }

    const applicable = results.filter(
      (r) => r.status === 'CREATED' || r.status === 'UPDATED',
    );
    if (applicable.length === 0) {
      return { dryRun: false, results, totalBeds };
    }

    await this.prisma.$transaction(async (tx) => {
      for (const res of applicable) {
        const row = parsed.rows.find((r) => r.unitCode === res.unitCode)!;
        const dept = deptByCode.get(row.departmentCode)!;
        const existing = unitByCode.get(row.unitCode);

        if (existing) {
          await tx.bedCapacityLog.create({
            data: {
              unitId: existing.id,
              previousCount: existing.bedCount,
              newCount: row.beds,
              reason: 'CSV import: unit & bed capacity configuration',
              changedBy: actorId,
            },
          });
          await tx.nursingUnit.update({
            where: { id: existing.id },
            data: {
              name: row.name,
              bedCount: row.beds,
              description: row.description ?? existing.description,
              departmentId: dept.id,
              updatedAt: new Date(),
            },
          });
        } else {
          const created = await tx.nursingUnit.create({
            data: {
              code: row.unitCode,
              name: row.name,
              description: row.description,
              departmentId: dept.id,
              bedCount: row.beds,
            },
          });
          await tx.bedCapacityLog.create({
            data: {
              unitId: created.id,
              previousCount: 0,
              newCount: row.beds,
              reason: 'CSV import: unit created',
              changedBy: actorId,
            },
          });
        }
      }

      await this.audit.logDomainEvent(tx, {
        action: 'UNITS_IMPORTED',
        resource: 'nursing_units',
        resourceId: null,
        changes: {
          created: results.filter((r) => r.status === 'CREATED').length,
          updated: results.filter((r) => r.status === 'UPDATED').length,
          rejected: results.filter((r) => r.status === 'REJECTED').length,
        },
      });
    });

    return { dryRun: false, results, totalBeds };
  }

  /** Live total used by the configuration grid and the coverage views. */
  async summary() {
    const units = await this.prisma.nursingUnit.findMany({
      where: { deletedAt: null },
      select: { bedCount: true, department: { select: { code: true, name: true } } },
    });

    const byDepartment: Record<string, number> = {};
    let totalBeds = 0;
    for (const u of units) {
      totalBeds += u.bedCount;
      byDepartment[u.department.code] =
        (byDepartment[u.department.code] ?? 0) + u.bedCount;
    }

    return { unitCount: units.length, totalBeds, byDepartment, seededBaselineBeds: 582 };
  }

  // ── internals ────────────────────────────────────────────────────────────

  private base(row: ParsedRow) {
    return { line: row.line, unitCode: row.unitCode };
  }

  private parseCsv(csv: string): { rows: ParsedRow[] } {
    const lines = csv
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length === 0) throw new ConflictException('CSV is empty');

    const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
    const missing = REQUIRED_HEADER.filter((h) => !header.includes(h));
    if (missing.length > 0) {
      throw new InvalidCsvHeaderError(
        `CSV header missing required column(s): ${missing.join(', ')}`,
      );
    }

    const idx = (name: string) => header.indexOf(name);
    const rows: ParsedRow[] = [];

    for (let i = 1; i < lines.length; i++) {
      const cells = lines[i].split(',').map((c) => c.trim());
      const unitCode = cells[idx('unit_code')]?.toUpperCase() ?? '';
      if (!unitCode) continue; // skip blank lines

      rows.push({
        line: i + 1,
        unitCode,
        name: cells[idx('name')] ?? unitCode,
        departmentCode: (cells[idx('department_code')] ?? '').toUpperCase(),
        beds: Number.parseInt(cells[idx('beds')] ?? '', 10),
        description: idx('description') >= 0 ? cells[idx('description')] : undefined,
      });
    }

    return { rows };
  }
}
