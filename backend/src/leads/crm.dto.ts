import { Transform } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  IsUUID,
  Matches,
  ValidateIf,
  ArrayMaxSize,
} from 'class-validator';
import {
  InteractionType,
  LeadStage,
  MatchStatus,
  PropertyPurpose,
  PropertyType,
} from '../prisma/client.js';

function trimText(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function trimStringArray(value: unknown): unknown {
  return Array.isArray(value)
    ? value.map((item: unknown) => trimText(item))
    : value;
}

export class PatchLeadPreferenceDto {
  @ValidateIf((_object, value) => value !== undefined)
  @Transform(({ value }) => trimStringArray(value))
  @IsArray()
  @ArrayMaxSize(5)
  @IsEnum(PropertyPurpose, { each: true })
  purposes?: PropertyPurpose[];

  @ValidateIf((_object, value) => value !== undefined)
  @Transform(({ value }) => trimStringArray(value))
  @IsArray()
  @ArrayMaxSize(10)
  @IsEnum(PropertyType, { each: true })
  types?: PropertyType[];

  @IsOptional()
  @IsInt()
  @Min(0)
  minPriceCents?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxPriceCents?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  minBedrooms?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  maxBedrooms?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  minParkingSpaces?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  maxParkingSpaces?: number | null;

  @ValidateIf((_object, value) => value !== undefined)
  @Transform(({ value }) => trimStringArray(value))
  @IsArray()
  @IsString({ each: true })
  @Length(1, 120, { each: true })
  @ArrayMaxSize(50)
  neighborhoods?: string[];

  @IsOptional()
  @Transform(({ value }) => trimText(value))
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}

export class CreateMatchDto {
  @IsUUID()
  propertyId!: string;

  @IsInt()
  @Min(0)
  @Max(100)
  score!: number;

  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(MatchStatus)
  status?: MatchStatus;

  @IsOptional()
  @Transform(({ value }) => trimText(value))
  @IsString()
  @Length(1, 500)
  rejectionReason?: string | null;
}

export class PatchMatchDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(0)
  @Max(100)
  score?: number;

  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(MatchStatus)
  status?: MatchStatus;

  @IsOptional()
  @Transform(({ value }) => trimText(value))
  @IsString()
  @Length(1, 500)
  rejectionReason?: string | null;
}

export class CreateInteractionDto {
  @IsEnum(InteractionType)
  type!: InteractionType;

  @IsDateString()
  @Matches(/Z$/)
  occurredAt!: string;

  @Transform(({ value }) => trimText(value))
  @IsString()
  @Length(1, 2000)
  summary!: string;

  @IsOptional()
  @Transform(({ value }) => trimText(value))
  @IsString()
  @Length(1, 80)
  channel?: string | null;
}

export class PatchLeadStageDto {
  @IsEnum(LeadStage)
  stage!: LeadStage;
}

export class CursorQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(512)
  cursor?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 25;
}
