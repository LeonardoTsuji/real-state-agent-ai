import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsBoolean, IsString, IsUUID, Length } from 'class-validator';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CursorQueryDto } from '../leads/crm.dto.js';
import { AiService } from './ai.service.js';
import { UserRateLimitGuard } from '../shared/http/user-rate-limit.guard.js';

class CreateConversationDto {
  @IsUUID() leadId!: string;
}
class SendMessageDto {
  @IsString() @Length(1, 4000) content!: string;
}
class ExtractPreferencesDto {
  @IsString() @Length(1, 4000) message!: string;
}
class ProposalDecisionDto {
  @IsBoolean() confirmed!: boolean;
}

@Controller()
@UseGuards(JwtAuthGuard, UserRateLimitGuard)
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Get('leads/:leadId/conversations')
  leadConversations(
    @Req() req: AuthenticatedRequest,
    @Param('leadId', ParseUUIDPipe) leadId: string,
    @Query() query: CursorQueryDto,
  ) {
    return this.ai.listLeadConversations(req.user.id, leadId, query);
  }

  @Get('conversations')
  listConversations(
    @Req() req: AuthenticatedRequest,
    @Query('leadId', ParseUUIDPipe) leadId: string,
  ) {
    return this.ai.listConversations(req.user.id, leadId);
  }

  @Get('conversations/:id/proposals')
  proposals(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.ai.listPendingProposals(req.user.id, id);
  }

  @Post('conversations')
  createConversation(
    @Req() req: AuthenticatedRequest,
    @Body() body: CreateConversationDto,
  ) {
    return this.ai.createConversation(req.user.id, body.leadId);
  }

  @Get('conversations/:id/messages')
  listMessages(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.ai.listMessages(req.user.id, id);
  }

  @Delete('conversations/:id/content')
  @HttpCode(HttpStatus.OK)
  eraseConversationContent(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.ai.eraseConversationContent(req.user.id, id);
  }

  @Post('conversations/:id/messages')
  sendMessage(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SendMessageDto,
    @Headers('idempotency-key') key?: string,
  ) {
    if (!key || key.length > 120)
      throw new BadRequestException(
        'A valid Idempotency-Key header is required',
      );
    return this.ai.sendMessage(
      req.user.id,
      id,
      body.content,
      key,
      req.requestId,
    );
  }

  @Post('conversations/:id/proposals/:proposalId/decision')
  decideProposal(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('proposalId', ParseUUIDPipe) proposalId: string,
    @Body() body: ProposalDecisionDto,
  ) {
    return this.ai.confirmProposal(
      req.user.id,
      id,
      proposalId,
      body.confirmed,
      req.requestId,
    );
  }

  @Post('ai/preferences/extract')
  extract(
    @Req() req: AuthenticatedRequest,
    @Body() body: ExtractPreferencesDto,
  ) {
    return this.ai.extractPreferences(req.user.id, body.message);
  }
}
