import { SetMetadata } from '@nestjs/common';
import type { Permission } from './permissions.js';

export const PERMISSIONS_METADATA_KEY = 'required-permissions';

export const RequirePermissions = (
  ...permissions: [Permission, ...Permission[]]
) => SetMetadata(PERMISSIONS_METADATA_KEY, permissions);
