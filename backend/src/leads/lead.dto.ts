import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

function trimText(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateLeadDto {
  @Transform(({ value }) => trimText(value))
  @IsString()
  @Length(1, 120)
  name!: string;

  @IsOptional()
  @Transform(({ value }) => trimText(value))
  @IsEmail()
  @MaxLength(254)
  email?: string | null;

  @IsOptional()
  @Transform(({ value }) => trimText(value))
  @IsString()
  @Matches(/^(?:\+[0-9]{7,19}|[0-9]{8,20})$/)
  phone?: string | null;

  @IsOptional()
  @Transform(({ value }) => trimText(value))
  @IsString()
  @Length(1, 2000)
  @MaxLength(2000)
  notes?: string | null;
}

export class UpdateLeadDto {
  @IsOptional()
  @Transform(({ value }) => trimText(value))
  @IsString()
  @Length(1, 120)
  name?: string;

  @IsOptional()
  @Transform(({ value }) => trimText(value))
  @IsEmail()
  @MaxLength(254)
  email?: string | null;

  @IsOptional()
  @Transform(({ value }) => trimText(value))
  @IsString()
  @Matches(/^(?:\+[0-9]{7,19}|[0-9]{8,20})$/)
  phone?: string | null;

  @IsOptional()
  @Transform(({ value }) => trimText(value))
  @IsString()
  @Length(1, 2000)
  @MaxLength(2000)
  notes?: string | null;
}
