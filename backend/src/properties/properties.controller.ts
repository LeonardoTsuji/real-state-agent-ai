import {
  Body,
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
import {
  CreatePropertyDto,
  SearchPropertiesQueryDto,
  UpdatePropertyDto,
} from './property.dto.js';
import { PropertiesService } from './properties.service.js';

@Controller('properties')
@UseGuards(JwtAuthGuard, UserRateLimitGuard)
export class PropertiesController {
  constructor(private readonly propertiesService: PropertiesService) {}

  @Post()
  create(@Req() request: AuthenticatedRequest, @Body() dto: CreatePropertyDto) {
    return this.propertiesService.create(
      request.user.id,
      dto,
      request.requestId,
    );
  }

  @Get()
  list(
    @Req() request: AuthenticatedRequest,
    @Query() query: SearchPropertiesQueryDto,
  ) {
    return this.propertiesService.list(request.user.id, query);
  }

  @Get(':id/compatibility')
  compatibility(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('leadId', ParseUUIDPipe) leadId: string,
  ) {
    return this.propertiesService.compatibility(req.user.id, id, leadId);
  }

  @Get(':id')
  get(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.propertiesService.get(request.user.id, id);
  }

  @Patch(':id')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePropertyDto,
  ) {
    return this.propertiesService.update(
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
    await this.propertiesService.remove(request.user.id, id, request.requestId);
  }
}
