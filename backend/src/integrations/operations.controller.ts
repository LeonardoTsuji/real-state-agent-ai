import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Permission } from '../auth/permissions.js';
import { PermissionsGuard } from '../auth/permissions.guard.js';
import { RequirePermissions } from '../auth/require-permissions.decorator.js';
import { UserRateLimitGuard } from '../shared/http/user-rate-limit.guard.js';
import { AsyncWorkflowsService } from './async-workflows.service.js';

@Controller('operations')
@UseGuards(JwtAuthGuard, UserRateLimitGuard, PermissionsGuard)
@RequirePermissions(Permission.OperationsRead)
export class OperationsController {
  constructor(private readonly workflows: AsyncWorkflowsService) {}

  @Get('jobs')
  jobs(@Query('limit') limit?: string) {
    return this.workflows.listJobs(Number(limit) || 50);
  }

  @Get('jobs/:id')
  job(@Param('id', ParseUUIDPipe) id: string) {
    return this.workflows.getJob(id);
  }

  @Post('jobs/:id/replay')
  @RequirePermissions(Permission.OperationsReplay)
  replay(@Param('id', ParseUUIDPipe) id: string) {
    return this.workflows.replay(id);
  }

  @Get('metrics')
  metrics() {
    return this.workflows.metrics();
  }

  @Get('metrics/ai')
  aiMetrics() {
    return this.workflows.aiMetrics();
  }
}
