import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PropertiesController } from './properties.controller.js';
import { PropertiesService } from './properties.service.js';

@Module({
  imports: [AuthModule],
  controllers: [PropertiesController],
  providers: [PropertiesService],
  exports: [PropertiesService],
})
export class PropertiesModule {}
