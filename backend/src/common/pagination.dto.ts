import { Transform } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

function decimalInteger(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return Number.NaN;
  return Number(value);
}

export class PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }) => decimalInteger(value))
  @IsInt()
  @Min(1)
  @Max(2147483647)
  page = 1;

  @IsOptional()
  @Transform(({ value }) => decimalInteger(value))
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}

export type Page<T> = {
  items: T[];
  page: number;
  limit: number;
  total: number;
};
