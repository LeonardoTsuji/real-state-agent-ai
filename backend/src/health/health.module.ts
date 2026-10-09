import { Module } from '@nestjs/common';
import { IntegrationsModule } from '../integrations/integrations.module.js';
import { HealthController } from './health.controller.js';

@Module({ imports: [IntegrationsModule], controllers: [HealthController] })
export class HealthModule {}
