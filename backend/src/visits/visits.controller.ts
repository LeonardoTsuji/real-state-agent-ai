import {
  Body,
  BadRequestException,
  ForbiddenException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { UserRateLimitGuard } from '../shared/http/user-rate-limit.guard.js';
import {
  CreateVisitDto,
  ListVisitsQueryDto,
  RescheduleVisitDto,
  CancelVisitDto,
  CheckInDto,
  ChecklistDto,
  FeedbackDraftDto,
  CompleteVisitDto,
} from './visit.dto.js';
import { VisitsService } from './visits.service.js';

@Controller('visits')
@UseGuards(JwtAuthGuard, UserRateLimitGuard)
export class VisitsController {
  constructor(
    private readonly visits: VisitsService,
    private readonly config: ConfigService,
  ) {}

  @Post()
  create(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateVisitDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.visits.create(req.user.id, dto, req.requestId, idempotencyKey);
  }

  @Get()
  list(@Req() req: AuthenticatedRequest, @Query() query: ListVisitsQueryDto) {
    return this.visits.list(req.user.id, query);
  }

  @Get(':id')
  get(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.visits.get(req.user.id, id);
  }

  @Patch(':id')
  reschedule(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RescheduleVisitDto,
  ) {
    return this.visits.reschedule(req.user.id, id, dto, req.requestId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  cancel(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.visits.cancel(req.user.id, id, req.requestId);
  }

  @Post(':id/cancel')
  cancelWithReason(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelVisitDto,
  ) {
    if (!dto.reason.trim())
      throw new BadRequestException('Cancellation reason is required');
    return this.visits.cancel(req.user.id, id, req.requestId, dto.reason);
  }

  @Post(':id/check-in')
  checkIn(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CheckInDto,
  ) {
    if (
      dto.mode === 'SIMULATED_LOCATION' &&
      !['true', '1'].includes(String(this.config.get('DEMO_MODE', 'false')))
    )
      throw new ForbiddenException('Demo mode is disabled');
    return this.visits.updateVisitState(req.user.id, id, 'check-in');
  }

  @Patch(':id/checklist')
  checklist(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChecklistDto,
  ) {
    if (
      Object.keys(dto.items).length > 100 ||
      Object.values(dto.items).some((value) => typeof value !== 'boolean')
    )
      throw new BadRequestException('Checklist must contain boolean items');
    return this.visits.updateVisitState(
      req.user.id,
      id,
      'checklist',
      dto.items,
    );
  }

  @Patch(':id/feedback-draft')
  feedbackDraft(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: FeedbackDraftDto,
  ) {
    return this.visits.updateVisitState(
      req.user.id,
      id,
      'feedback-draft',
      dto.feedback,
    );
  }

  @Post(':id/complete')
  complete(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompleteVisitDto,
  ) {
    return this.visits.complete(req.user.id, id, req.requestId, dto);
  }
}
