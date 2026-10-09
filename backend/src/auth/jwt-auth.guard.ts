import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthenticatedUser } from './authenticated-request.js';

type AccessTokenClaims = {
  sub: string;
};

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();
    const authorization = request.headers.authorization;
    const [scheme, token, extra] = authorization?.split(' ') ?? [];

    if (scheme !== 'Bearer' || !token || extra) {
      throw new UnauthorizedException();
    }

    let claims: AccessTokenClaims;
    try {
      claims = await this.jwtService.verifyAsync<AccessTokenClaims>(token, {
        algorithms: ['HS256'],
      });
    } catch {
      throw new UnauthorizedException();
    }

    if (typeof claims.sub !== 'string' || claims.sub.length === 0) {
      throw new UnauthorizedException();
    }

    const broker = await this.prisma.broker.findUnique({
      where: { id: claims.sub },
      select: { id: true, role: true },
    });
    if (!broker) {
      throw new UnauthorizedException();
    }

    request.user = { id: broker.id, role: broker.role };
    return true;
  }
}
