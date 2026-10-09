import { ConflictException } from '@nestjs/common';
import { Prisma } from '../prisma/client.js';

export async function prepareSchedule(
  tx: Prisma.TransactionClient,
  brokerId: string,
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${brokerId}, 0))`;
  await tx.reservation.updateMany({
    where: { brokerId, status: 'PENDING', expiresAt: { lte: new Date() } },
    data: { status: 'EXPIRED' },
  });
}
export function scheduleConflict(error: unknown): never {
  const details = error instanceof Error ? error.message : '';
  if (
    details.includes('calendar_occupancies_no_overlap') ||
    details.includes('visits_no_broker_overlap') ||
    details.includes('23P01') ||
    (error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2004')
  ) {
    throw new ConflictException(
      'The selected time overlaps another calendar occupation',
    );
  }
  throw error;
}
