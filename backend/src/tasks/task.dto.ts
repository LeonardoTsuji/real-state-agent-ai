import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
} from 'class-validator';
import { TaskStatus } from '../prisma/client.js';
import { CursorQueryDto } from '../leads/crm.dto.js';

export class CreateTaskDto {
  @IsUUID()
  leadId!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(1, 200)
  title!: string;

  @IsDateString()
  @Matches(/Z$/)
  dueAt!: string;
}

export class UpdateTaskStatusDto {
  @IsEnum(TaskStatus)
  status!: TaskStatus;
}

export class ListTasksQueryDto extends CursorQueryDto {
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @IsOptional()
  @IsUUID()
  leadId?: string;
}
