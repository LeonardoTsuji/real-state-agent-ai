import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  IsArray,
  ArrayMaxSize,
  ArrayMinSize,
  IsBoolean,
} from 'class-validator';
import { PaginationQueryDto } from '../common/pagination.dto.js';
import { LeadStage } from '../prisma/client.js';

export class SearchLeadsQueryDto extends PaginationQueryDto {
  @IsOptional() @IsString() @Length(1, 120) q?: string;
  @IsOptional() @IsEnum(LeadStage) stage?: LeadStage;
  @IsOptional()
  @Transform(({ value }) =>
    /^\d+$/.test(String(value)) ? Number(value) : Number.NaN,
  )
  @IsInt()
  @Min(0)
  @Max(2147483647)
  minPriceCents?: number;
  @IsOptional()
  @Transform(({ value }) =>
    /^\d+$/.test(String(value)) ? Number(value) : Number.NaN,
  )
  @IsInt()
  @Min(0)
  @Max(2147483647)
  maxPriceCents?: number;
  @IsOptional() @IsDateString() lastInteractionFrom?: string;
  @IsOptional() @IsDateString() lastInteractionTo?: string;
}
export class ImportLeadsDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) rows!: unknown[];
  @IsOptional() @IsBoolean() preview?: boolean;
}
