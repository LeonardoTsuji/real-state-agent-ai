import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../prisma/client.js';
import type { Page } from '../common/pagination.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { writeAudit } from '../audit/audit.js';
import {
  CreatePropertyDto,
  SearchPropertiesQueryDto,
  UpdatePropertyDto,
} from './property.dto.js';

const propertyResponseSelect = {
  id: true,
  code: true,
  address: true,
  subtype: true,
  availability: true,
  areaM2: true,
  suites: true,
  bathrooms: true,
  condominiumCents: true,
  iptuCents: true,
  amenities: true,
  media: true,
  accessNotes: true,
  title: true,
  description: true,
  purpose: true,
  type: true,
  priceCents: true,
  city: true,
  neighborhood: true,
  bedrooms: true,
  parkingSpaces: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.PropertySelect;

@Injectable()
export class PropertiesService {
  constructor(private readonly prisma: PrismaService) {}

  create(brokerId: string, dto: CreatePropertyDto, requestId?: string) {
    return this.prisma.$transaction(async (tx) => {
      const property = await tx.property.create({
        data: {
          ...dto,
          media: dto.media === null ? Prisma.DbNull : dto.media,
          brokerId,
        },
        select: propertyResponseSelect,
      });
      await writeAudit(tx, {
        brokerId,
        actorId: brokerId,
        entityType: 'property',
        entityId: property.id,
        action: 'CREATE',
        changedFields: Object.keys(dto),
        requestId,
      });
      return property;
    });
  }

  async list(
    brokerId: string,
    query: SearchPropertiesQueryDto,
  ): Promise<Page<unknown>> {
    if (
      query.minPriceCents !== undefined &&
      query.maxPriceCents !== undefined &&
      query.minPriceCents > query.maxPriceCents
    ) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'Minimum price cannot exceed maximum price',
        details: [
          {
            field: 'minPriceCents',
            message: 'Must be less than or equal to maxPriceCents',
          },
        ],
      });
    }

    const where: Prisma.PropertyWhereInput = {
      brokerId,
      deletedAt: null,
      availability: query.availability,
      subtype: query.subtype,
      areaM2: query.minAreaM2 == null ? undefined : { gte: query.minAreaM2 },
      ...(query.q
        ? {
            OR: ['title', 'code', 'address', 'description'].map((field) => ({
              [field]: { contains: query.q!.trim(), mode: 'insensitive' },
            })),
          }
        : {}),
      purpose: query.purpose,
      type: query.type,
      priceCents:
        query.minPriceCents !== undefined || query.maxPriceCents !== undefined
          ? {
              gte: query.minPriceCents,
              lte: query.maxPriceCents,
            }
          : undefined,
      bedrooms:
        query.minBedrooms === undefined
          ? undefined
          : { gte: query.minBedrooms },
      parkingSpaces:
        query.minParkingSpaces === undefined
          ? undefined
          : { gte: query.minParkingSpaces },
      city:
        query.city === undefined
          ? undefined
          : { equals: query.city, mode: 'insensitive' },
      neighborhood:
        query.neighborhood === undefined
          ? undefined
          : { equals: query.neighborhood, mode: 'insensitive' },
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.property.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy:
          query.sort === 'price_asc'
            ? [{ priceCents: 'asc' }, { id: 'asc' }]
            : query.sort === 'price_desc'
              ? [{ priceCents: 'desc' }, { id: 'desc' }]
              : query.sort === 'area_desc'
                ? [{ areaM2: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }]
                : [{ createdAt: 'desc' }, { id: 'desc' }],
        select: propertyResponseSelect,
      }),
      this.prisma.property.count({ where }),
    ]);
    const preference = query.leadId
      ? await this.preference(brokerId, query.leadId)
      : undefined;
    return {
      items: query.leadId
        ? items.map((property) => ({
            ...property,
            compatibility: calculateCompatibility(property, preference ?? null),
          }))
        : items,
      page: query.page,
      limit: query.limit,
      total,
    };
  }

  private async preference(brokerId: string, leadId: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, brokerId, deletedAt: null },
      include: { preference: true },
    });
    if (!lead) throw new NotFoundException();
    return lead.preference;
  }

  async compatibility(brokerId: string, propertyId: string, leadId: string) {
    const [property, preference] = await Promise.all([
      this.get(brokerId, propertyId),
      this.preference(brokerId, leadId),
    ]);
    return {
      ...calculateCompatibility(property, preference),
      propertyId,
      leadId,
    };
  }

  async get(brokerId: string, id: string) {
    const property = await this.prisma.property.findFirst({
      where: { id, brokerId, deletedAt: null },
      select: propertyResponseSelect,
    });
    if (!property) throw new NotFoundException();
    return property;
  }

  async update(
    brokerId: string,
    id: string,
    dto: UpdatePropertyDto,
    requestId?: string,
  ) {
    if (!Object.values(dto).some((value) => value !== undefined)) {
      throw new BadRequestException('At least one field must be provided');
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const property = await tx.property.update({
          where: { id, brokerId, deletedAt: null },
          data: {
            ...dto,
            media: dto.media === null ? Prisma.DbNull : dto.media,
          },
          select: propertyResponseSelect,
        });
        await writeAudit(tx, {
          brokerId,
          actorId: brokerId,
          entityType: 'property',
          entityId: id,
          action: 'UPDATE',
          changedFields: Object.keys(dto),
          requestId,
        });
        return property;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException();
      }
      throw error;
    }
  }

  async remove(
    brokerId: string,
    id: string,
    requestId?: string,
  ): Promise<void> {
    const result = await this.prisma.$transaction(async (tx) => {
      const deleted = await tx.property.updateMany({
        where: { id, brokerId, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      if (deleted.count > 0)
        await writeAudit(tx, {
          brokerId,
          actorId: brokerId,
          entityType: 'property',
          entityId: id,
          action: 'DELETE',
          changedFields: ['deletedAt'],
          requestId,
        });
      return deleted;
    });
    if (result.count === 0) throw new NotFoundException();
  }
}

export function calculateCompatibility(
  property: {
    priceCents: number;
    neighborhood: string;
    type: string;
    purpose: string;
    bedrooms: number;
    parkingSpaces: number;
  },
  preference: {
    minPriceCents: number | null;
    maxPriceCents: number | null;
    neighborhoods: string[];
    types: string[];
    purposes: string[];
    minBedrooms: number | null;
    maxBedrooms: number | null;
    minParkingSpaces: number | null;
    maxParkingSpaces: number | null;
  } | null,
) {
  const criteria: Array<{ key: string; label: string; matched: boolean }> = [];
  if (preference) {
    const range = (value: number, min: number | null, max: number | null) =>
      (min == null || value >= min) && (max == null || value <= max);
    if (preference.minPriceCents != null || preference.maxPriceCents != null)
      criteria.push({
        key: 'budget',
        label: 'Orçamento',
        matched: range(
          property.priceCents,
          preference.minPriceCents,
          preference.maxPriceCents,
        ),
      });
    if (preference.neighborhoods.length)
      criteria.push({
        key: 'location',
        label: 'Localização',
        matched: preference.neighborhoods.some(
          (n) =>
            n.toLocaleLowerCase() === property.neighborhood.toLocaleLowerCase(),
        ),
      });
    if (preference.types.length)
      criteria.push({
        key: 'type',
        label: 'Tipo',
        matched: preference.types.includes(property.type),
      });
    if (preference.purposes.length)
      criteria.push({
        key: 'purpose',
        label: 'Finalidade',
        matched: preference.purposes.includes(property.purpose),
      });
    if (preference.minBedrooms != null || preference.maxBedrooms != null)
      criteria.push({
        key: 'bedrooms',
        label: 'Quartos',
        matched: range(
          property.bedrooms,
          preference.minBedrooms,
          preference.maxBedrooms,
        ),
      });
    if (
      preference.minParkingSpaces != null ||
      preference.maxParkingSpaces != null
    )
      criteria.push({
        key: 'parking',
        label: 'Vagas',
        matched: range(
          property.parkingSpaces,
          preference.minParkingSpaces,
          preference.maxParkingSpaces,
        ),
      });
  }
  return {
    method: 'deterministic' as const,
    score: criteria.length
      ? Math.round(
          (criteria.filter((c) => c.matched).length * 100) / criteria.length,
        )
      : null,
    criteria,
  };
}
