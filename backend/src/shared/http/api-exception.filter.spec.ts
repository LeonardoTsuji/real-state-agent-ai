/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
import {
  ArgumentsHost,
  HttpException,
  HttpStatus,
  ServiceUnavailableException,
} from '@nestjs/common';
import { jest } from '@jest/globals';
import { ApiExceptionFilter } from './api-exception.filter.js';

describe('ApiExceptionFilter', () => {
  let filter: ApiExceptionFilter;
  let response: {
    status: jest.Mock;
    json: jest.Mock;
  };
  let host: ArgumentsHost;

  beforeEach(() => {
    filter = new ApiExceptionFilter();
    response = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    host = {
      switchToHttp: () => ({
        getRequest: () => ({ method: 'GET', path: '/sensitive' }),
        getResponse: () => response,
      }),
    } as unknown as ArgumentsHost;
  });

  it('hides details from unexpected internal errors', () => {
    filter.catch(new Error('database password leaked'), host);

    expect(response.status).toHaveBeenCalledWith(
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
    expect(response.json).toHaveBeenCalledWith({
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  });

  it('preserves service-unavailable status without exposing provider details', () => {
    filter.catch(
      new ServiceUnavailableException('provider key or response detail'),
      host,
    );

    expect(response.status).toHaveBeenCalledWith(
      HttpStatus.SERVICE_UNAVAILABLE,
    );
    expect(response.json).toHaveBeenCalledWith({
      statusCode: 503,
      code: 'SERVICE_UNAVAILABLE',
      message: 'A required service is temporarily unavailable',
    });
  });

  it('maps validation messages to field details', () => {
    filter.catch(
      new HttpException(
        { statusCode: 400, message: ['email must be valid'] },
        HttpStatus.BAD_REQUEST,
      ),
      host,
    );

    expect(response.json).toHaveBeenCalledWith({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      details: [{ field: 'email', message: 'email must be valid' }],
    });
  });
});
