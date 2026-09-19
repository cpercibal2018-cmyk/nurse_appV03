// src/modules/workforce/dto/import-units.dto.ts
// B-24 — CSV import of a full unit/bed plan (Section 2.9).
//
// Expected CSV columns: unit_code,name,department_code,beds,description
// Header row required. `dryRun` defaults to TRUE — a caller must opt in to
// writing, so a mistyped import cannot silently re-baseline the hospital.

import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class ImportUnitsDto {
  @IsString()
  @MaxLength(2_000_000) // ~2 MB of CSV; the field plan is far smaller
  csv!: string;

  @IsOptional()
  @IsBoolean()
  dryRun: boolean = true; // explicit opt-in required to write
}

export interface ImportRowResult {
  line: number;
  unitCode: string;
  status: 'CREATED' | 'UPDATED' | 'UNCHANGED' | 'REJECTED';
  reason?: string;
}

export class InvalidCsvHeaderError extends Error {}
