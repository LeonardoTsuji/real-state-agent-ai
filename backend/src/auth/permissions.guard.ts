import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedUser } from './authenticated-request.js';
import { Permission, ROLE_PERMISSIONS } from './permissions.js';
import { PERMISSIONS_METADATA_KEY } from './require-permissions.decorator.js';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const { user } = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();
    if (!user?.id) throw new UnauthorizedException();

    const required = this.reflector.getAllAndOverride<readonly Permission[]>(
      PERMISSIONS_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );
    const granted = ROLE_PERMISSIONS[user.role];
    if (
      !required?.length ||
      !Array.isArray(granted) ||
      !required.every((permission) => granted.includes(permission))
    ) {
      throw new ForbiddenException();
    }
    return true;
  }
}
