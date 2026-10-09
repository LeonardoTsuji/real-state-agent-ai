import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnvironment } from './configuration/environment.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuthModule } from './auth/auth.module.js';
import { LeadsModule } from './leads/leads.module.js';
import { PropertiesModule } from './properties/properties.module.js';
import { VisitsModule } from './visits/visits.module.js';
import { TasksModule } from './tasks/tasks.module.js';
import { IntegrationsModule } from './integrations/integrations.module.js';
import { AiModule } from './ai/ai.module.js';
import { HealthModule } from './health/health.module.js';
import { SchedulingModule } from './scheduling/scheduling.module.js';
import { CommercialModule } from './commercial/commercial.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnvironment,
    }),
    PrismaModule,
    AuthModule,
    LeadsModule,
    PropertiesModule,
    VisitsModule,
    TasksModule,
    IntegrationsModule,
    AiModule,
    HealthModule,
    SchedulingModule,
    CommercialModule,
  ],
})
export class AppModule {}
