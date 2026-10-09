import {
  IsDateString,
  IsOptional,
  IsUUID,
  Matches,
  IsString,
  MaxLength,
  IsObject,
  ValidateNested,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';
import { LeadStage, VisitStatus } from '../prisma/client.js';
import { IsEnum } from 'class-validator';
import { CursorQueryDto } from '../leads/crm.dto.js';

export class CreateVisitDto {
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsUUID()
  leadId!: string;

  @IsUUID()
  propertyId!: string;

  @IsDateString()
  @Matches(/Z$/)
  startAt!: string;

  @IsDateString()
  @Matches(/Z$/)
  endAt!: string;
}

export class RescheduleVisitDto {
  @IsOptional() @IsString() @MaxLength(1000) reason?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsDateString()
  @Matches(/Z$/)
  startAt!: string;

  @IsDateString()
  @Matches(/Z$/)
  endAt!: string;
}

export class ListVisitsQueryDto extends CursorQueryDto {
  @IsOptional()
  @IsEnum(VisitStatus)
  status?: VisitStatus;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

export class CancelVisitDto {
  @IsString() @MaxLength(1000) reason!: string;
}
export class CheckInDto {
  @IsOptional() @IsIn(['MANUAL', 'SIMULATED_LOCATION']) mode?:
    'MANUAL' | 'SIMULATED_LOCATION';
}
export class ChecklistDto {
  @IsObject() items!: Record<string, boolean>;
}
export class FeedbackDraftDto {
  @IsObject() feedback!: Record<string, unknown>;
}
export class VisitTaskDto {
  @IsString() @MaxLength(200) title!: string;
  @IsDateString() @Matches(/Z$/) dueAt!: string;
}
export class CompleteVisitDto {
  @IsOptional() @IsObject() feedback?: Record<string, unknown>;
  @IsOptional() @IsEnum(LeadStage) nextStage?: LeadStage;
  @IsOptional() @ValidateNested() @Type(() => VisitTaskDto) task?: VisitTaskDto;
}
