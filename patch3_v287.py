#!/usr/bin/env python3
"""Amendment 2.8.7a: units and bed capacity as runtime configuration
(bulk API + CSV import), robust acceptance wording, KSA region allowlist
correction. Asserts exact match counts; aborts without writing on mismatch."""
import os
import pathlib

# Paths resolve relative to this script's directory (override with AIGH_ROOT).
ROOT = pathlib.Path(os.environ.get('AIGH_ROOT', pathlib.Path(__file__).resolve().parent))

DOC = ROOT / 'AIGH_Nursing_Workforce_Management_System_v2_8_7.md'
text = DOC.read_text(encoding='utf-8')
patches = []


def P(name, old, new, count=1):
    patches.append((name, old, new, count))


# ------------------------------------------------------------------ header
P("HDR-2.8.7a",
  "canonical audit schema, PDPL migration (V35), idempotency lease semantics, worker leases (V49)",
  "canonical audit schema, PDPL migration (V35), idempotency lease semantics, worker leases (V49); 2.8.7a — units and bed capacity as runtime configuration (bulk API + CSV import), KSA region allowlist correction")

# ------------------------------------------------------------------ §2.9 summary
P("CAP-summary",
  """**Summary:** 5 departments, 47 nursing units, total bed capacity: 582.

These totals are derived from the unit catalog above and from the seed data in this section; both were reconciled in revision 2.8.7. If the Hospital Master Unit Directory reports a different unit list or total, HR must add the missing units to the catalog **before** the V28 acceptance test can pass — the two sources must agree.""",
  """**Summary (seeded baseline):** 5 departments, 47 nursing units, total bed capacity: 582 — by department: EMAC 133, SURG 38, CRIT 165, GNSP 246, CORP 0.

This is the **initial seed** taken from the Hospital Master Unit Directory. It is a starting point, not a fixed constraint: units and bed capacity are fully editable in the running system. HR Admin and System Admin can add or edit units, adjust a single unit's bed capacity, or apply a **bulk capacity update / CSV import** to enter a required bed plan in one action (see "Entering the required numbers" below). Every change — single or bulk — is recorded in `bed_capacity_log` with actor, reason, previous value and new value.

**Authority after go-live:** the directory is the reference for the initial seed only. Once live, the system is the operational source of truth for unit structure and bed capacity; reports, coverage calculations and staffing-ratio views always read current capacity. Entering the required numbers is a configuration task, not a release, and never requires a migration.""")

# ------------------------------------------------------------------ §2.9 acceptance rows
P("CAP-acceptance",
  """| Units seeded | 47 nursing units exist with correct department assignments and bed counts |
| Bed capacity total | Sum of all unit bed counts equals 582 |""",
  """| Units configured | Every unit in the active configuration has a valid parent department, a unique code and a bed count within 0–500; the seeded baseline is 47 units across 5 departments |
| Bed capacity total | `GET /api/v1/units/summary` returns a total equal to the sum of active units' bed counts at test time (seeded baseline: 582). The criterion verifies internal consistency and correct recomputation after edits — not a frozen number — so configuration changes never invalidate the test |
| Bulk configuration | `PUT /api/v1/units/bed-capacity/bulk` and `POST /api/v1/units/import` (dry-run, then commit) apply a full required bed plan in one action; each changed unit writes a `bed_capacity_log` row with actor and reason; negative or >500 values and unknown unit codes are rejected with per-row errors |""")

# ------------------------------------------------------------------ §2.9 bed edit bullet
P("CAP-bed-rule",
  "- **Edit** — adjust bed capacity to reflect ward reconfigurations, surge capacity or seasonal changes. Each change is recorded with a timestamp, the previous value, the new value and the actor, in a `bed_capacity_log` audit table.",
  "- **Edit** — adjust bed capacity to reflect ward reconfigurations, surge capacity or seasonal changes. Each change is recorded with a timestamp, the previous value, the new value and the actor, in a `bed_capacity_log` audit table. Bulk edits follow the same rule: every changed unit produces its own log row, so a full re-baseline is fully traceable.")

# ------------------------------------------------------------------ §2.9 bulk implementation
P("CAP-bulk-impl",
  "**Implementation — soft delete with referential safety:**",
  """**Implementation — entering the required numbers: bulk capacity update and CSV import:**

Units and bed counts are configuration data, not release data. Two endpoints set the required numbers in one action; both run in a single transaction per batch and write one `bed_capacity_log` row per changed unit.

```typescript
// src/modules/workforce/controllers/units.controller.ts
@Put('bed-capacity/bulk')
@RequireRole('HR_ADMIN', 'SYSTEM_ADMIN')
async bulkUpdateBedCapacity(@Body() dto: BulkBedCapacityDto, @Req() req) {
  return this.workforceService.bulkUpdateBedCapacity(dto, req.user.id);
}

@Post('import')
@RequireRole('HR_ADMIN', 'SYSTEM_ADMIN')
async importUnits(@Body() dto: ImportUnitsDto, @Req() req) {
  // dryRun = true validates and reports without writing; dry-run is the default
  return this.workforceService.importUnits(dto, req.user.id, dto.dryRun ?? true);
}
```

```typescript
// src/modules/workforce/workforce.service.ts — one transaction per batch
async bulkUpdateBedCapacity(dto: BulkBedCapacityDto, actorId: number) {
  return this.prisma.$transaction(async (tx) => {
    const results: BulkRowResult[] = [];

    for (const row of dto.rows) {
      const unit = await tx.nursingUnit.findUnique({ where: { code: row.unitCode } });

      if (!unit || unit.deletedAt) {
        results.push({ unitCode: row.unitCode, status: 'REJECTED', reason: 'Unknown or deleted unit' });
        continue;
      }
      if (row.bedCount < 0 || row.bedCount > 500) {
        results.push({ unitCode: row.unitCode, status: 'REJECTED', reason: 'Bed count must be 0–500' });
        continue;
      }
      if (unit.bedCount === row.bedCount) {
        results.push({ unitCode: row.unitCode, status: 'UNCHANGED' });
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

    await this.auditService.logDomainEvent(tx, {
      action: 'BED_CAPACITY_BULK_UPDATED',
      resource: 'nursing_units',
      changes: {
        updated:   results.filter((r) => r.status === 'UPDATED').length,
        unchanged: results.filter((r) => r.status === 'UNCHANGED').length,
        rejected:  results.filter((r) => r.status === 'REJECTED').length,
      },
    });

    return results;
  });
}
```

**CSV import format** (`POST /api/v1/units/import`): columns `unit_code,name,department_code,beds,description`. `dryRun: true` (the default) validates every row — unknown department, unknown or duplicate unit code, bed count outside 0–500 — and returns a per-row report without writing. `dryRun: false` applies the valid rows in one transaction and returns rejected rows for correction. The importer never deletes units; removing a unit remains the guarded soft-delete operation described below.

**UI — Unit & Bed Capacity Configuration screen:** an editable grid grouped by department showing code, name, beds and the running total, with "Baseline 582 → Configured N" displayed live and the current configuration exportable to CSV. The total comes from `GET /api/v1/units/summary` — the same value the coverage and staffing-ratio views read — so entering the required numbers is verifiable on one screen and takes effect immediately.

**Implementation — soft delete with referential safety:**""")

# ------------------------------------------------------------------ §11.3 row
P("CAP-113-row",
  "| Hospital organizational structure | 5 departments and 47 units seeded with correct hierarchy and bed counts (total 582); department/unit/bed CRUD operations work with referential safety; soft deletes exclude from active views but preserve history; bed capacity changes logged with actor and reason; coverage monitoring reads bed_count; frontend selectors grouped by department |",
  "| Hospital organizational structure | 5 departments and the active unit configuration with valid hierarchy and bed counts within 0–500 (seeded baseline: 47 units / 582 beds — editable in-system at any time); department/unit/bed CRUD plus bulk capacity update and CSV import with referential safety; soft deletes exclude from active views but preserve history; single and bulk capacity changes logged with actor and reason; coverage monitoring reads the current `bed_count`; frontend selectors grouped by department |")

# ------------------------------------------------------------------ §13.4.1 row
P("CAP-1341-row",
  "| Capacity context | 582 beds, 47 nursing units, estimated 800–1500 nursing staff | Peak concurrent users during scheduling windows TBD |",
  "| Capacity context | Seeded baseline: 582 beds across 47 nursing units — capacity is fully configurable in-system, so size for the configured plan rather than the seed; estimated 800–1500 nursing staff | Peak concurrent users during scheduling windows TBD |")

# ------------------------------------------------------------------ §8.3.6 residency allowlist
P("CAP-residency",
  """PDPL_ALLOWED_REGIONS=ksa,me-south-1  # Region validation for startup check
```

**Implementation — blind index search logic:**""",
  """# KSA-only allowlist. Use the chosen provider's KSA region IDs, for example:
#   Oracle (Jeddah / Riyadh):  me-jeddah-1, me-riyadh-1
#   Google (Dammam):           me-central-2
#   On-premise pilot:          ksa-onprem
# NEVER include non-KSA regions: AWS me-south-1 is Bahrain, me-central-1 is the UAE.
PDPL_ALLOWED_REGIONS=me-jeddah-1,me-riyadh-1,ksa-onprem  # Region validation for startup check
```

**Allowlist integrity (2.8.7a correction):** earlier revisions showed `me-south-1` in the example allowlist — that region is AWS **Bahrain**, which contradicts the KSA residency requirement stated immediately above. The startup check must fail closed when the allowlist is empty or contains any region outside the hospital's approved KSA list; the list is maintained per provider and re-reviewed at each hosting decision (Section 13.4.1).

**Implementation — blind index search logic:**""")

# ------------------------------------------------------------------ §12 status row
P("CAP-12-row",
  "| Hospital organizational structure (departments, units, bed capacity) | Implementation specification | Section 2.9 |",
  """| Hospital organizational structure (departments, units, bed capacity) | Implementation specification | Section 2.9 |
| Unit & bed capacity bulk configuration (bulk API, CSV import, configuration grid) | Implementation specification | Section 2.9 |""")

print(f"Patches defined: {len(patches)}")
failures = []
for name, old, new, count in patches:
    found = text.count(old)
    if found != count:
        failures.append((name, found, count))
        print(f"FAIL  {name}: found {found}, expected {count}")
    else:
        text = text.replace(old, new)
        print(f"ok    {name} ({count})")

if failures:
    print(f"\n{len(failures)} patch(es) failed — output NOT written.")
    raise SystemExit(1)

DOC.write_text(text, encoding='utf-8')
print(f"\nAll {len(patches)} patches applied. Updated {DOC}")
