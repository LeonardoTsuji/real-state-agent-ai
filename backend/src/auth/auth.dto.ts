import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, MaxLength } from 'class-validator';

function trimText(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function normalizeEmail(value: unknown): unknown {
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

export class RegisterBrokerDto {
  @Transform(({ value }) => trimText(value))
  @IsString()
  @Length(1, 120)
  name!: string;

  @Transform(({ value }) => normalizeEmail(value))
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @Length(12, 128)
  password!: string;
}

export class LoginDto {
  @Transform(({ value }) => normalizeEmail(value))
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @Length(1, 128)
  password!: string;
}
