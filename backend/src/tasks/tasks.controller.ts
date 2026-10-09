import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { UserRateLimitGuard } from '../shared/http/user-rate-limit.guard.js';
import {
  CreateTaskDto,
  ListTasksQueryDto,
  UpdateTaskStatusDto,
} from './task.dto.js';
import { TasksService } from './tasks.service.js';

@Controller('tasks')
@UseGuards(JwtAuthGuard, UserRateLimitGuard)
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Post()
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateTaskDto) {
    return this.tasks.create(req.user.id, dto, req.requestId);
  }

  @Get()
  list(@Req() req: AuthenticatedRequest, @Query() query: ListTasksQueryDto) {
    return this.tasks.list(req.user.id, query);
  }

  @Patch(':id/status')
  updateStatus(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaskStatusDto,
  ) {
    return this.tasks.updateStatus(req.user.id, id, dto, req.requestId);
  }
}
