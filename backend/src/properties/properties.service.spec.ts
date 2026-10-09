import { NotFoundException } from '@nestjs/common';
import {
  PropertiesService,
  calculateCompatibility,
} from './properties.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
const property = {
  priceCents: 62000000,
  neighborhood: 'Bela Vista',
  purpose: 'SALE',
  type: 'APARTMENT',
  bedrooms: 2,
  parkingSpaces: 1,
};
const preference = {
  minPriceCents: null,
  maxPriceCents: 65000000,
  neighborhoods: ['bela vista'],
  types: ['APARTMENT'],
  purposes: ['SALE'],
  minBedrooms: 2,
  maxBedrooms: null,
  minParkingSpaces: 2,
  maxParkingSpaces: null,
};
describe('deterministic property compatibility', () => {
  it('explains partial agreement and compares location case insensitively', () => {
    const result = calculateCompatibility(property, preference);
    expect(result.score).toBe(83);
    expect(result.criteria.find((c) => c.key === 'location')?.matched).toBe(
      true,
    );
    expect(result.criteria.find((c) => c.key === 'parking')?.matched).toBe(
      false,
    );
  });
  it('does not invent affinity without preferences', () => {
    expect(calculateCompatibility(property, null)).toEqual({
      method: 'deterministic',
      score: null,
      criteria: [],
    });
  });
  it('rejects compatibility against another broker lead', async () => {
    const service = new PropertiesService({
      property: { findFirst: () => Promise.resolve(property) },
      lead: { findFirst: () => Promise.resolve(null) },
    } as unknown as PrismaService);
    await expect(
      service.compatibility('broker', 'property', 'other-lead'),
    ).rejects.toThrow(NotFoundException);
  });
});
