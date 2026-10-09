import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureHttpApp } from './http-app.js';
import { configureOpenApi } from './openapi.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  configureHttpApp(app);
  configureOpenApi(app);
  app.enableShutdownHooks();
  if (process.env.PROCESS_ROLE === 'worker') await app.init();
  else await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
