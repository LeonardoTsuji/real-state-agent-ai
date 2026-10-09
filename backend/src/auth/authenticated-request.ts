import { Request } from 'express';
import type { BrokerRole } from '../prisma/client.js';

export type AuthenticatedUser = { id: string; role: BrokerRole };

export type AuthenticatedRequest = Request & {
  user: AuthenticatedUser;
  requestId?: string;
};
