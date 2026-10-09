import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { createHash } from 'node:crypto';
import { consumeRateLimit } from './rate-limit.js';
import { safeRouteName } from './safe-route-name.js';

type AuthenticatedHttpRequest = Request & { user?: { id?: string } };

@Injectable()
export class UserRateLimitGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<AuthenticatedHttpRequest>();
    const actorId = request.user?.id;
    if (!actorId) return true;
    const aiRequest =
      request.path.includes('/conversations') || request.path.includes('/ai/');
    const limit = aiRequest
      ? this.config.get<number>('RATE_LIMIT_AI_USER_MAX', 20)
      : this.config.get<number>('RATE_LIMIT_USER_MAX', 300);
    const windowMs = this.config.get<number>('RATE_LIMIT_WINDOW_MS', 60_000);
    const result = consumeRateLimit(
      `actor:${actorId}:${request.method}:${safeRouteName(request)}`,
      limit,
      windowMs,
    );
    if (!result.allowed) {
      process.stderr.write(
        `${JSON.stringify({
          timestamp: new Date().toISOString(),
          level: 'warn',
          service: 'api',
          event: 'actor_rate_limited',
          correlationId: (
            request as AuthenticatedHttpRequest & { requestId?: string }
          ).requestId,
          actorHash: createHash('sha256')
            .update(actorId)
            .digest('hex')
            .slice(0, 16),
          route: safeRouteName(request),
        })}\n`,
      );
      throw new HttpException(
        'Too many requests',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
