import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { VisitsController } from './visits.controller.js';
import { VisitsService } from './visits.service.js';
import { IntegrationsModule } from '../integrations/integrations.module.js';

@Module({
  imports: [AuthModule, IntegrationsModule],
  controllers: [VisitsController],
  providers: [VisitsService],
  exports: [VisitsService],
})
export class VisitsModule {}
