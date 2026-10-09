import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AsyncWorkflowsService } from '../integrations/async-workflows.service.js';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workflows: AsyncWorkflowsService,
  ) {}

  @Get('live')
  live() {
    return { status: 'alive' };
  }

  @Get('ready')
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      await this.workflows.checkQueueReady();
      return {
        status: 'ready',
        dependencies: { database: 'ready', queue: 'ready' },
      };
    } catch {
      throw new ServiceUnavailableException({
        code: 'NOT_READY',
        message: 'A required dependency is unavailable',
      });
    }
  }
}
