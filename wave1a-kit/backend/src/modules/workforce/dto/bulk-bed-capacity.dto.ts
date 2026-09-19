// src/modules/workforce/dto/bulk-bed-capacity.dto.ts
// B-24 — bulk bed-capacity entry (Section 2.9).

import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class BedCapacityRowDto {
  @IsString()
  @MaxLength(20)
  unitCode!: string;

  @IsInt()
  @Min(0)
  @Max(500) // mirrors chk_bed_count_range on nursing_units
  bedCount!: number;
}

export class BulkBedCapacityDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => BedCapacityRowDto)
  rows!: BedCapacityRowDto[];

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}

export type BulkRowStatus = 'UPDATED' | 'UNCHANGED' | 'REJECTED';

export interface BulkRowResult {
  unitCode: string;
  status: BulkRowStatus;
  reason?: string;
  previous?: number;
  next?: number;
}
