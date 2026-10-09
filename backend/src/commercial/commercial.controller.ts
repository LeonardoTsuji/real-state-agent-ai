import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { UserRateLimitGuard } from '../shared/http/user-rate-limit.guard.js';
import { CommercialService } from './commercial.service.js';
import {
  AcceptDto,
  CreateDocumentDto,
  CreateOpportunityDto,
  OpportunitiesQueryDto,
  PatchOpportunityDto,
  ProposalDto,
  SimulatePaymentDto,
} from './commercial.dto.js';
function validKey(key?: string) {
  if (!key || key.length > 120)
    throw new BadRequestException('A valid Idempotency-Key header is required');
  return key;
}
@Controller('commercial')
@UseGuards(JwtAuthGuard, UserRateLimitGuard)
export class CommercialController {
  constructor(private readonly service: CommercialService) {}
  @Get('pipeline') pipeline(
    @Req() req: AuthenticatedRequest,
    @Query() query: OpportunitiesQueryDto,
  ) {
    return this.service.pipeline(req.user.id, query);
  }
  @Get('opportunities') list(
    @Req() req: AuthenticatedRequest,
    @Query() query: OpportunitiesQueryDto,
  ) {
    return this.service.list(req.user.id, query);
  }
  @Post('opportunities') create(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateOpportunityDto,
  ) {
    return this.service.create(req.user.id, dto, req.requestId);
  }
  @Get('opportunities/:id') get(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.get(req.user.id, id);
  }
  @Patch('opportunities/:id') patch(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PatchOpportunityDto,
  ) {
    return this.service.patch(req.user.id, id, dto, req.requestId);
  }
  @Post('opportunities/:id/proposal') proposal(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ProposalDto,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.service.proposal(
      req.user.id,
      id,
      dto,
      validKey(key),
      req.requestId,
    );
  }
  @Post('opportunities/:id/accept') accept(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AcceptDto,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.service.accept(
      req.user.id,
      id,
      dto,
      validKey(key),
      req.requestId,
    );
  }
  @Get('opportunities/:id/installments') installments(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.installments(req.user.id, id);
  }
  @Post('installments/:id/pay') pay(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SimulatePaymentDto,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.service.pay(req.user.id, id, dto, validKey(key), req.requestId);
  }
  @Get('documents') documents(
    @Req() req: AuthenticatedRequest,
    @Query() query: OpportunitiesQueryDto,
  ) {
    return this.service.documents(req.user.id, query);
  }
  @Post('documents') document(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateDocumentDto,
  ) {
    return this.service.createDocument(req.user.id, dto, req.requestId);
  }
  @Get('documents/:id') getDocument(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.document(req.user.id, id);
  }
}
