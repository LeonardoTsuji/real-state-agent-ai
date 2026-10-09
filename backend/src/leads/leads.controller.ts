import {
  Body,
  Headers,
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
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
import { SearchLeadsQueryDto, ImportLeadsDto } from './search-leads.dto.js';
import { CreateLeadDto, UpdateLeadDto } from './lead.dto.js';
import { LeadsService } from './leads.service.js';
import {
  CreateInteractionDto,
  CreateMatchDto,
  CursorQueryDto,
  PatchLeadPreferenceDto,
  PatchLeadStageDto,
  PatchMatchDto,
} from './crm.dto.js';

@Controller('leads')
@UseGuards(JwtAuthGuard, UserRateLimitGuard)
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Post('import')
  import(
    @Req() request: AuthenticatedRequest,
    @Body() dto: ImportLeadsDto,
    @Headers('idempotency-key') key?: string,
  ) {
    if (!dto.preview && (!key || key.length > 120))
      throw new BadRequestException('A valid Idempotency-Key is required');
    return this.leadsService.importRows(
      request.user.id,
      dto,
      key,
      request.requestId,
    );
  }

  @Get('funnel')
  funnel(@Req() request: AuthenticatedRequest) {
    return this.leadsService.funnel(request.user.id);
  }

  @Patch(':id/preferences')
  patchPreference(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PatchLeadPreferenceDto,
  ) {
    return this.leadsService.patchPreference(
      request.user.id,
      id,
      dto,
      request.requestId,
    );
  }

  @Get(':id/preferences')
  getPreference(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.leadsService.getPreference(request.user.id, id);
  }

  @Post(':id/matches')
  createMatch(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateMatchDto,
  ) {
    return this.leadsService.createMatch(
      request.user.id,
      id,
      dto,
      request.requestId,
    );
  }

  @Get(':id/matches')
  listMatches(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: CursorQueryDto,
  ) {
    return this.leadsService.listMatches(request.user.id, id, query);
  }

  @Patch(':leadId/matches/:propertyId')
  updateMatch(
    @Req() request: AuthenticatedRequest,
    @Param('leadId', ParseUUIDPipe) leadId: string,
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Body() dto: PatchMatchDto,
  ) {
    return this.leadsService.updateMatch(
      request.user.id,
      leadId,
      propertyId,
      dto,
      request.requestId,
    );
  }

  @Post(':id/interactions')
  createInteraction(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateInteractionDto,
  ) {
    return this.leadsService.createInteraction(request.user.id, id, dto);
  }

  @Get(':id/interactions')
  listInteractions(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: CursorQueryDto,
  ) {
    return this.leadsService.listInteractions(request.user.id, id, query);
  }

  @Patch(':id/stage')
  updateStage(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PatchLeadStageDto,
  ) {
    return this.leadsService.updateStage(
      request.user.id,
      id,
      dto,
      request.requestId,
    );
  }

  @Post()
  create(@Req() request: AuthenticatedRequest, @Body() dto: CreateLeadDto) {
    return this.leadsService.create(request.user.id, dto, request.requestId);
  }

  @Get()
  list(
    @Req() request: AuthenticatedRequest,
    @Query() query: SearchLeadsQueryDto,
  ) {
    return this.leadsService.list(request.user.id, query);
  }

  @Get(':id')
  get(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.leadsService.get(request.user.id, id);
  }

  @Patch(':id')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLeadDto,
  ) {
    return this.leadsService.update(
      request.user.id,
      id,
      dto,
      request.requestId,
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.leadsService.remove(request.user.id, id, request.requestId);
  }
}
