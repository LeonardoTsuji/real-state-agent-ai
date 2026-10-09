import 'reflect-metadata';
import {
  ExecutionContext,
  ForbiddenException,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard.js';
import { Permission } from './permissions.js';
import {
  PERMISSIONS_METADATA_KEY,
  RequirePermissions,
} from './require-permissions.decorator.js';

@RequirePermissions(Permission.OperationsRead)
class ProtectedController {
  read(this: void) {}

  @RequirePermissions(Permission.OperationsReplay)
  replay(this: void) {}

  @RequirePermissions(Permission.OperationsRead, Permission.OperationsReplay)
  both(this: void) {}

  @SetMetadata(PERMISSIONS_METADATA_KEY, [Permission.OperationsRead, 'unknown'])
  unsupported(this: void) {}

  @SetMetadata(PERMISSIONS_METADATA_KEY, [])
  empty(this: void) {}
}

class UndeclaredController {
  read(this: void) {}
}

function context(
  user?: { id?: string; role?: string },
  handler = ProtectedController.prototype.read,
  controller:
    | typeof ProtectedController
    | typeof UndeclaredController = ProtectedController,
): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => handler,
    getClass: () => controller,
  } as unknown as ExecutionContext;
}

describe('PermissionsGuard', () => {
  const guard = new PermissionsGuard(new Reflector());
  const operator = { id: 'operator', role: 'OPERATOR' };

  it('requires an authenticated identity', () => {
    expect(() => guard.canActivate(context())).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(context({ role: 'OPERATOR' }))).toThrow(
      UnauthorizedException,
    );
  });

  it('allows operators and rejects brokers for operational permissions', () => {
    for (const handler of [
      ProtectedController.prototype.read,
      ProtectedController.prototype.replay,
      ProtectedController.prototype.both,
    ]) {
      expect(guard.canActivate(context(operator, handler))).toBe(true);
      expect(() =>
        guard.canActivate(context({ id: 'broker', role: 'BROKER' }, handler)),
      ).toThrow(ForbiddenException);
    }
  });

  it('denies missing, unknown and inherited-object role names', () => {
    for (const role of [undefined, 'ADMIN', 'toString', '__proto__']) {
      expect(() => guard.canActivate(context({ id: 'broker', role }))).toThrow(
        ForbiddenException,
      );
    }
  });

  it('denies routes without a permission declaration or with an empty one', () => {
    expect(() =>
      guard.canActivate(
        context(
          operator,
          UndeclaredController.prototype.read,
          UndeclaredController,
        ),
      ),
    ).toThrow(ForbiddenException);
    expect(() =>
      guard.canActivate(context(operator, ProtectedController.prototype.empty)),
    ).toThrow(ForbiddenException);
  });

  it('honors method metadata and requires every declared permission', () => {
    expect(() =>
      guard.canActivate(
        context(operator, ProtectedController.prototype.unsupported),
      ),
    ).toThrow(ForbiddenException);
    expect(
      new Reflector().getAllAndOverride(PERMISSIONS_METADATA_KEY, [
        ProtectedController.prototype.replay,
        ProtectedController,
      ]),
    ).toEqual([Permission.OperationsReplay]);
  });
});
