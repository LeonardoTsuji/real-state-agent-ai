import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ApiExceptionFilter } from './shared/http/api-exception.filter.js';
import { RequestMetricsInterceptor } from './shared/http/request-metrics.interceptor.js';
import { RequestIdMiddleware } from './shared/http/request-id.middleware.js';
import { IpRateLimitMiddleware } from './shared/http/rate-limit.middleware.js';

export function configureHttpApp(app: INestApplication): void {
  const requestIdMiddleware = new RequestIdMiddleware();
  const rateLimitMiddleware = new IpRateLimitMiddleware();
  const expressApp = app.getHttpAdapter().getInstance() as {
    set: (name: string, value: unknown) => void;
  };
  expressApp.set(
    'trust proxy',
    positiveInteger(process.env.TRUST_PROXY_HOPS, 0),
  );
  app.use(requestIdMiddleware.use.bind(requestIdMiddleware));
  app.use(rateLimitMiddleware.use.bind(rateLimitMiddleware));
  const bodyParserApp = app as INestApplication & {
    useBodyParser: (
      type: 'json' | 'urlencoded',
      options: { limit: string; extended?: boolean },
    ) => unknown;
  };
  bodyParserApp.useBodyParser('json', {
    limit: process.env.HTTP_BODY_LIMIT ?? '100kb',
  });
  bodyParserApp.useBodyParser('urlencoded', {
    extended: false,
    limit: process.env.HTTP_BODY_LIMIT ?? '100kb',
  });
  const server = app.getHttpServer() as {
    requestTimeout?: number;
    headersTimeout?: number;
  };
  server.requestTimeout = positiveInteger(
    process.env.HTTP_REQUEST_TIMEOUT_MS,
    30_000,
  );
  server.headersTimeout = Math.min(
    positiveInteger(process.env.HTTP_HEADERS_TIMEOUT_MS, 15_000),
    server.requestTimeout,
  );
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
      validationError: { target: false, value: false },
    }),
  );
  app.useGlobalFilters(new ApiExceptionFilter());
  app.useGlobalInterceptors(new RequestMetricsInterceptor());
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}
