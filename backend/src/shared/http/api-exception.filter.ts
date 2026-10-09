import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { createHash } from 'node:crypto';
import { safeRouteName } from './safe-route-name.js';

type ErrorBody = {
  statusCode: number;
  code: string;
  message: string | string[];
  details?: Array<{ field: string; message: string }>;
};

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    let body: ErrorBody;
    if (exception instanceof HttpException) {
      body = this.mapHttpException(exception, status);
    } else {
      const requestId = (request as Request & { requestId?: string }).requestId;
      process.stderr.write(
        `${JSON.stringify({
          timestamp: new Date().toISOString(),
          level: 'error',
          service: 'api',
          event: 'unhandled_exception',
          correlationId: requestId,
          method: request.method,
          route: safeRouteName(request),
          statusCode: status,
        })}\n`,
      );
      body = {
        statusCode: status,
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      };
    }

    if (status === 404 || status === 401) {
      const userId = (request as Request & { user?: { id?: string } }).user?.id;
      process.stderr.write(
        `${JSON.stringify({
          timestamp: new Date().toISOString(),
          level: 'warn',
          service: 'api',
          event:
            status === 404 ? 'resource_access_denied' : 'authentication_denied',
          correlationId: (request as Request & { requestId?: string })
            .requestId,
          actorHash: userId
            ? createHash('sha256').update(userId).digest('hex').slice(0, 16)
            : undefined,
          method: request.method,
          route: safeRouteName(request),
          statusCode: status,
        })}\n`,
      );
    }

    response.status(status).json(body);
  }

  private mapHttpException(
    exception: HttpException,
    status: number,
  ): ErrorBody {
    if (status === 503) {
      return {
        statusCode: status,
        code: 'SERVICE_UNAVAILABLE',
        message: 'A required service is temporarily unavailable',
      };
    }

    if (status >= 500) {
      return {
        statusCode: status,
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      };
    }

    const payload = exception.getResponse();
    const payloadObject =
      typeof payload === 'object' && payload !== null
        ? (payload as Record<string, unknown>)
        : undefined;
    const rawMessage = payloadObject?.message ?? payload;
    const explicitCode = payloadObject?.code;

    if (status === 400 && Array.isArray(rawMessage)) {
      return {
        statusCode: status,
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: rawMessage.map((item) => ({
          field: this.fieldFromValidation(String(item)),
          message: String(item),
        })),
      };
    }

    const knownCodes: Partial<Record<number, string>> = {
      [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
      [HttpStatus.NOT_FOUND]: 'RESOURCE_NOT_FOUND',
      [HttpStatus.CONFLICT]: 'CONFLICT',
      [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
    };
    const explicitDetails = this.detailsFromPayload(payloadObject?.details);

    return {
      statusCode: status,
      code:
        (typeof explicitCode === 'string' ? explicitCode : undefined) ??
        knownCodes[status] ??
        (status === 400 ? 'VALIDATION_ERROR' : 'HTTP_ERROR'),
      message: typeof rawMessage === 'string' ? rawMessage : exception.message,
      ...(explicitDetails ? { details: explicitDetails } : {}),
    };
  }

  private detailsFromPayload(
    value: unknown,
  ): Array<{ field: string; message: string }> | undefined {
    if (!Array.isArray(value)) return undefined;
    const details: Array<{ field: string; message: string }> = [];
    for (const item of value) {
      if (typeof item !== 'object' || item === null) continue;
      const record = item as Record<string, unknown>;
      if (
        typeof record.field === 'string' &&
        typeof record.message === 'string'
      ) {
        details.push({ field: record.field, message: record.message });
      }
    }
    return details.length > 0 ? details : undefined;
  }

  private fieldFromValidation(message: string): string {
    const unknownProperty = /^property (\S+)/.exec(message);
    if (unknownProperty?.[1]) {
      return unknownProperty[1];
    }

    return message.split(' ')[0] ?? 'request';
  }
}
