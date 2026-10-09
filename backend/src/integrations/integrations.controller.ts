import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { AsyncWorkflowsService } from './async-workflows.service.js';
import {
  CreateFollowUpDto,
  ImportPropertiesDto,
  SendMessageDto,
} from './integrations.dto.js';
import { UserRateLimitGuard } from '../shared/http/user-rate-limit.guard.js';

@Controller()
@UseGuards(JwtAuthGuard, UserRateLimitGuard)
export class IntegrationsController {
  constructor(private readonly workflows: AsyncWorkflowsService) {}

  @Post('follow-ups') createFollowUp(
    @Req() req: AuthenticatedRequest,
    @Body() body: CreateFollowUpDto,
  ) {
    return this.workflows.createFollowUp(req.user.id, body);
  }
  @Patch('follow-ups/:id/complete') completeFollowUp(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.workflows.changeFollowUp(req.user.id, id, 'COMPLETED');
  }
  @Patch('follow-ups/:id/cancel') cancelFollowUp(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.workflows.changeFollowUp(req.user.id, id, 'CANCELED');
  }
  @Post('imports/properties') importProperties(
    @Req() req: AuthenticatedRequest,
    @Body() body: ImportPropertiesDto,
  ) {
    return this.workflows.createImport(
      req.user.id,
      body.idempotencyKey,
      body.rows,
    );
  }
  @Get('imports/properties/:id') getImport(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.workflows.getImport(req.user.id, id);
  }
  @Post('leads/:leadId/messages') sendMessage(
    @Req() req: AuthenticatedRequest,
    @Param('leadId', ParseUUIDPipe) leadId: string,
    @Body() body: SendMessageDto,
  ) {
    return this.workflows.createMessage(
      req.user.id,
      leadId,
      body.idempotencyKey,
      body.body,
    );
  }
  @Get('leads/:leadId/messages') listMessages(
    @Req() req: AuthenticatedRequest,
    @Param('leadId', ParseUUIDPipe) leadId: string,
  ) {
    return this.workflows.listMessages(req.user.id, leadId);
  }
  @Post('visits/:id/calendar-sync') scheduleCalendar(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.workflows.scheduleCalendar(req.user.id, id);
  }
  @Get('visits/:id/calendar-event') getCalendarEvent(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.workflows.calendarEvent(req.user.id, id);
  }
}
