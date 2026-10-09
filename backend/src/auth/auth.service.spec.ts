import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthService } from './auth.service.js';
describe('authenticated profile', () => {
  it('reads current permissions from the database on every lookup', async () => {
    let role = 'OPERATOR';
    const prisma = {
      broker: {
        findUnique: () =>
          Promise.resolve({
            id: 'broker',
            name: 'Marina',
            email: 'marina@example.com',
            role,
            creci: null,
            monthlyGoalCents: 12000000,
          }),
      },
      lead: { count: () => Promise.resolve(2) },
      property: { count: () => Promise.resolve(3) },
      visit: { count: () => Promise.resolve(1) },
      $transaction: (requests: Promise<unknown>[]) => Promise.all(requests),
    };
    const api = new AuthService(
      prisma as unknown as PrismaService,
      {} as JwtService,
      {
        get: (key: string) => (key === 'DEMO_MODE' ? true : 'test'),
      } as unknown as ConfigService,
    );
    expect(await api.me('broker')).toMatchObject({
      permissions: ['operations:read', 'operations:replay'],
      summary: { leads: 2, properties: 3, visits: 1 },
    });
    role = 'BROKER';
    expect(await api.me('broker')).toMatchObject({ permissions: [] });
  });
  it('rejects a missing broker session', async () => {
    const api = new AuthService(
      {
        broker: { findUnique: () => Promise.resolve(null) },
      } as unknown as PrismaService,
      {} as JwtService,
      {
        get: (key: string) => (key === 'DEMO_MODE' ? true : 'test'),
      } as unknown as ConfigService,
    );
    await expect(api.me('deleted-broker')).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
