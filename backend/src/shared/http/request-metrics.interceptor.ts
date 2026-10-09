import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';
import { safeRouteName } from './safe-route-name.js';

@Injectable()
export class RequestMetricsInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const startedAt = performance.now();

    return next.handle().pipe(
      tap({
        finalize: () => {
          const durationMs = Math.round(performance.now() - startedAt);
          const route = safeRouteName(request);
          const requestId = (request as Request & { requestId?: string })
            .requestId;
          process.stdout.write(
            `${JSON.stringify({
              timestamp: new Date().toISOString(),
              level: 'info',
              service: 'api',
              event: 'http_request',
              correlationId: requestId,
              method: request.method,
              route,
              statusCode: response.statusCode,
              durationMs,
            })}\n`,
          );
        },
      }),
    );
  }
}
