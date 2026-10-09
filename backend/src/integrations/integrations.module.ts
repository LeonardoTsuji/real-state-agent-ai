import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AsyncWorkflowsService } from './async-workflows.service.js';
import { IntegrationsController } from './integrations.controller.js';
import { OperationsController } from './operations.controller.js';

@Module({
  imports: [AuthModule],
  controllers: [IntegrationsController, OperationsController],
  providers: [AsyncWorkflowsService],
  exports: [AsyncWorkflowsService],
})
export class IntegrationsModule {}
