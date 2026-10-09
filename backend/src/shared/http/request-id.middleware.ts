import { randomUUID } from 'node:crypto';
import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { correlationContext } from './correlation-context.js';

export type RequestWithId = Request & { requestId: string };

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction): void {
    const supplied = request.header('x-request-id');
    const requestId =
      supplied && /^[A-Za-z0-9._-]{1,64}$/.test(supplied)
        ? supplied
        : randomUUID();
    (request as RequestWithId).requestId = requestId;
    response.setHeader('x-request-id', requestId);
    correlationContext.run(requestId, next);
  }
}
