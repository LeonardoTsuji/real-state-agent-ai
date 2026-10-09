import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CommercialController } from './commercial.controller.js';
import { CommercialService } from './commercial.service.js';
import { PdfController } from './pdf.controller.js';
@Module({
  imports: [AuthModule],
  controllers: [CommercialController, PdfController],
  providers: [CommercialService],
  exports: [CommercialService],
})
export class CommercialModule {}
