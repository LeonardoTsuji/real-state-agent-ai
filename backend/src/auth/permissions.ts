import type { BrokerRole } from '../prisma/client.js';

export const Permission = {
  OperationsRead: 'operations:read',
  OperationsReplay: 'operations:replay',
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];

export const ROLE_PERMISSIONS: Readonly<
  Record<BrokerRole, readonly Permission[]>
> = {
  BROKER: [],
  OPERATOR: [Permission.OperationsRead, Permission.OperationsReplay],
};
