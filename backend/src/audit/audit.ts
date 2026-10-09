import type { Prisma } from '../prisma/client.js';

export type AuditAction =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'TRANSITION'
  | 'READ_CONTENT'
  | 'ACCESS_DENIED'
  | 'ANONYMIZE';

export async function writeAudit(
  tx: Prisma.TransactionClient,
  event: {
    brokerId: string;
    actorId: string;
    entityType: string;
    entityId: string;
    action: AuditAction;
    changedFields?: string[];
    requestId?: string;
  },
): Promise<void> {
  await tx.auditLog.create({
    data: {
      brokerId: event.brokerId,
      actorId: event.actorId,
      entityType: event.entityType,
      entityId: event.entityId,
      action: event.action,
      requestId: event.requestId,
      changes: event.changedFields
        ? { fields: event.changedFields }
        : undefined,
    },
  });
}
