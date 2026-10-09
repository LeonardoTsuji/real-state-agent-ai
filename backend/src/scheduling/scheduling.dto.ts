import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  IsIn,
  Matches,
  MaxLength,
} from 'class-validator';
import { ReservationStrategy } from '../prisma/client.js';
export class ScheduleIntervalDto {
  @IsDateString() @Matches(/Z$/) startAt!: string;
  @IsDateString() @Matches(/Z$/) endAt!: string;
}
export class AgendaQueryDto {
  @IsDateString() from!: string;
  @IsDateString() to!: string;
}
export class ReservationDto extends ScheduleIntervalDto {
  @IsUUID() leadId!: string;
  @IsUUID() propertyId!: string;
  @IsEnum(ReservationStrategy) strategy!: ReservationStrategy;
  @IsOptional() @IsUUID() visitId?: string;
  @IsOptional() @IsString() @MaxLength(4000) message?: string;
}
export class ReservationDecisionDto {
  @IsBoolean() confirmed!: boolean;
}
export class BlockDto extends ScheduleIntervalDto {
  @IsString() @MaxLength(200) title!: string;
}

export class ReservationSimulationDto {
  @IsOptional() @IsBoolean() confirmed?: boolean;
  @IsOptional() @IsIn(['NO_RESPONSE', 'SEND_FAILED']) event?:
    'NO_RESPONSE' | 'SEND_FAILED';
}
