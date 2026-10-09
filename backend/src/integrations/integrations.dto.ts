import {
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsString,
  IsTimeZone,
  MaxLength,
  IsObject,
} from 'class-validator';

export class CreateFollowUpDto {
  @IsString() @IsNotEmpty() idempotencyKey!: string;
  @IsString() @IsNotEmpty() leadId!: string;
  @IsString() @MaxLength(200) title!: string;
  @IsDateString() dueAt!: string;
  @IsTimeZone() timezone!: string;
}

export class ImportPropertiesDto {
  @IsString() @IsNotEmpty() idempotencyKey!: string;
  @IsArray() @IsObject({ each: true }) rows!: Record<string, unknown>[];
}

export class SendMessageDto {
  @IsString() @IsNotEmpty() idempotencyKey!: string;
  @IsString() @MaxLength(4000) body!: string;
}
