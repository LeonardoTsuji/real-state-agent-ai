import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsArray,
  IsNumber,
  IsIn,
  IsUUID,
  ArrayMaxSize,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
import { PropertyPurpose, PropertyType } from '../prisma/client.js';
import { PaginationQueryDto } from '../common/pagination.dto.js';

function trimText(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function decimalInteger(value: unknown): number {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return Number.NaN;
  return Number(value);
}

export class PropertyMetadataDto {
  @IsOptional() @IsString() @Length(1, 80) code?: string | null;
  @IsOptional() @IsString() @Length(1, 500) address?: string | null;
  @IsOptional() @IsString() @Length(1, 80) subtype?: string | null;
  @IsOptional()
  @IsIn(['AVAILABLE', 'RESERVED', 'SOLD', 'RENTED'])
  availability?: string | null;
  @IsOptional() @IsNumber() @Min(1) @Max(1000000) areaM2?: number | null;
  @IsOptional() @IsInt() @Min(0) @Max(100) suites?: number | null;
  @IsOptional() @IsInt() @Min(0) @Max(100) bathrooms?: number | null;
  @IsOptional() @IsInt() @Min(0) @Max(2147483647) condominiumCents?:
    number | null;
  @IsOptional() @IsInt() @Min(0) @Max(2147483647) iptuCents?: number | null;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @Length(1, 120, { each: true })
  amenities?: string[];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @Length(1, 1000, { each: true })
  media?: string[] | null;
  @IsOptional() @IsString() @Length(1, 2000) accessNotes?: string | null;
}

export class CreatePropertyDto extends PropertyMetadataDto {
  @Transform(({ value }) => trimText(value))
  @IsString()
  @Length(1, 160)
  title!: string;

  @IsOptional()
  @Transform(({ value }) => trimText(value))
  @IsString()
  @Length(1, 5000)
  description?: string | null;

  @IsEnum(PropertyPurpose)
  purpose!: PropertyPurpose;

  @IsEnum(PropertyType)
  type!: PropertyType;

  @IsInt()
  @Min(1)
  @Max(2147483647)
  priceCents!: number;

  @Transform(({ value }) => trimText(value))
  @IsString()
  @Length(1, 120)
  city!: string;

  @Transform(({ value }) => trimText(value))
  @IsString()
  @Length(1, 120)
  neighborhood!: string;

  @IsInt()
  @Min(0)
  @Max(100)
  bedrooms!: number;

  @IsInt()
  @Min(0)
  @Max(100)
  parkingSpaces!: number;
}

export class UpdatePropertyDto extends PropertyMetadataDto {
  @IsOptional()
  @Transform(({ value }) => trimText(value))
  @IsString()
  @Length(1, 160)
  title?: string;

  @IsOptional()
  @Transform(({ value }) => trimText(value))
  @IsString()
  @Length(1, 5000)
  description?: string | null;

  @IsOptional()
  @IsEnum(PropertyPurpose)
  purpose?: PropertyPurpose;

  @IsOptional()
  @IsEnum(PropertyType)
  type?: PropertyType;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2147483647)
  priceCents?: number;

  @IsOptional()
  @Transform(({ value }) => trimText(value))
  @IsString()
  @Length(1, 120)
  city?: string;

  @IsOptional()
  @Transform(({ value }) => trimText(value))
  @IsString()
  @Length(1, 120)
  neighborhood?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  bedrooms?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  parkingSpaces?: number;
}

export class SearchPropertiesQueryDto extends PaginationQueryDto {
  @IsOptional() @IsString() @Length(1, 160) q?: string;
  @IsOptional()
  @IsIn(['newest', 'price_asc', 'price_desc', 'area_desc'])
  sort?: string;
  @IsOptional() @IsUUID() leadId?: string;
  @IsOptional()
  @IsIn(['AVAILABLE', 'RESERVED', 'SOLD', 'RENTED'])
  availability?: string;
  @IsOptional() @IsString() @Length(1, 80) subtype?: string;
  @IsOptional()
  @Transform(({ value }) => decimalInteger(value))
  @IsInt()
  @Min(0)
  @Max(1000000)
  minAreaM2?: number;

  @IsOptional()
  @IsEnum(PropertyPurpose)
  purpose?: PropertyPurpose;

  @IsOptional()
  @IsEnum(PropertyType)
  type?: PropertyType;

  @IsOptional()
  @Transform(({ value }) => trimText(value))
  @IsString()
  @Length(1, 120)
  city?: string;

  @IsOptional()
  @Transform(({ value }) => trimText(value))
  @IsString()
  @Length(1, 120)
  neighborhood?: string;

  @IsOptional()
  @Transform(({ value }) => decimalInteger(value))
  @IsInt()
  @Min(0)
  @Max(2147483647)
  minPriceCents?: number;

  @IsOptional()
  @Transform(({ value }) => decimalInteger(value))
  @IsInt()
  @Min(0)
  @Max(2147483647)
  maxPriceCents?: number;

  @IsOptional()
  @Transform(({ value }) => decimalInteger(value))
  @IsInt()
  @Min(0)
  @Max(100)
  minBedrooms?: number;

  @IsOptional()
  @Transform(({ value }) => decimalInteger(value))
  @IsInt()
  @Min(0)
  @Max(100)
  minParkingSpaces?: number;
}
