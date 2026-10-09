import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { LeadsModule } from '../leads/leads.module.js';
import { PropertiesModule } from '../properties/properties.module.js';
import { VisitsModule } from '../visits/visits.module.js';
import { TasksModule } from '../tasks/tasks.module.js';
import { AiController } from './ai.controller.js';
import { AiService } from './ai.service.js';
import { ConfiguredLlmAdapter, LlmAdapter } from './llm.adapter.js';

@Module({
  imports: [
    AuthModule,
    LeadsModule,
    PropertiesModule,
    VisitsModule,
    TasksModule,
  ],
  controllers: [AiController],
  providers: [
    AiService,
    ConfiguredLlmAdapter,
    { provide: LlmAdapter, useExisting: ConfiguredLlmAdapter },
  ],
})
export class AiModule {}
