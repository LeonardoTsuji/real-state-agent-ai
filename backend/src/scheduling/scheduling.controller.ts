import {
  Body,
  BadRequestException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { UserRateLimitGuard } from '../shared/http/user-rate-limit.guard.js';
import { SchedulingService } from './scheduling.service.js';
import {
  AgendaQueryDto,
  BlockDto,
  ReservationDecisionDto,
  ReservationSimulationDto,
  ReservationDto,
  ScheduleIntervalDto,
} from './scheduling.dto.js';
@Controller()
@UseGuards(JwtAuthGuard, UserRateLimitGuard)
export class SchedulingController {
  constructor(
    private readonly scheduling: SchedulingService,
    private readonly config: ConfigService,
  ) {}
  @Get('agenda')
  agenda(@Req() req: AuthenticatedRequest, @Query() query: AgendaQueryDto) {
    return this.scheduling.agenda(req.user.id, query);
  }
  @Get('scheduling/suggestions')
  suggestions(
    @Req() req: AuthenticatedRequest,
    @Query() query: ScheduleIntervalDto,
  ) {
    return this.scheduling.suggestions(req.user.id, query);
  }
  @Get('scheduling/reservations')
  reservations(@Req() req: AuthenticatedRequest) {
    return this.scheduling.listReservations(req.user.id);
  }
  @Post('scheduling/reservations')
  reserve(
    @Req() req: AuthenticatedRequest,
    @Body() dto: ReservationDto,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.scheduling.reserve(req.user.id, dto, key);
  }
  @Post('scheduling/reservations/:id/decision')
  decision(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReservationDecisionDto,
  ) {
    return this.scheduling.decide(req.user.id, id, dto.confirmed);
  }
  @Post('scheduling/reservations/:id/simulate-response')
  simulate(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReservationSimulationDto,
  ) {
    if (!['true', '1'].includes(String(this.config.get('DEMO_MODE', 'false'))))
      throw new ForbiddenException('Demo mode is disabled');
    if (dto.event) {
      if (dto.confirmed !== undefined)
        throw new BadRequestException('Choose event or confirmed');
      return this.scheduling.simulateEvent(req.user.id, id, dto.event);
    }
    if (typeof dto.confirmed !== 'boolean')
      throw new BadRequestException(
        'A simulation event or confirmed is required',
      );
    return this.scheduling.decide(req.user.id, id, dto.confirmed);
  }
  @Post('scheduling/blocks')
  block(
    @Req() req: AuthenticatedRequest,
    @Body() dto: BlockDto,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.scheduling.block(req.user.id, dto, key);
  }
  @Delete('scheduling/blocks/:id')
  removeBlock(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.scheduling.removeBlock(req.user.id, id);
  }
}
