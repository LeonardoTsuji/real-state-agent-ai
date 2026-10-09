import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { consumeRateLimit } from './rate-limit.js';
import { createHash } from 'node:crypto';

@Injectable()
export class IpRateLimitMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction): void {
    const limit = positiveInteger(process.env.RATE_LIMIT_IP_MAX, 120);
    const windowMs = positiveInteger(process.env.RATE_LIMIT_WINDOW_MS, 60_000);
    const route = request.path.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':id');
    const result = consumeRateLimit(
      `ip:${request.ip ?? 'unknown'}:${route}`,
      limit,
      windowMs,
    );
    if (!result.allowed) {
      process.stderr.write(
        `${JSON.stringify({
          timestamp: new Date().toISOString(),
          level: 'warn',
          service: 'api',
          event: 'rate_limited',
          correlationId: (request as Request & { requestId?: string })
            .requestId,
          ipHash: createHash('sha256')
            .update(request.ip ?? 'unknown')
            .digest('hex')
            .slice(0, 16),
          route,
        })}\n`,
      );
      response.setHeader('retry-after', result.retryAfterSeconds);
      response.status(429).json({
        statusCode: 429,
        code: 'RATE_LIMITED',
        message: 'Too many requests',
      });
      return;
    }
    next();
  }
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}
