import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '../prisma/client.js';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service.js';
import { ROLE_PERMISSIONS } from './permissions.js';
import { LoginDto, RegisterBrokerDto } from './auth.dto.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async me(id: string) {
    const broker = await this.prisma.broker.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        creci: true,
        monthlyGoalCents: true,
      },
    });
    if (!broker) throw new UnauthorizedException();
    const [leads, properties, visits] = await this.prisma.$transaction([
      this.prisma.lead.count({ where: { brokerId: id, deletedAt: null } }),
      this.prisma.property.count({ where: { brokerId: id, deletedAt: null } }),
      this.prisma.visit.count({ where: { brokerId: id, status: 'SCHEDULED' } }),
    ]);
    return {
      ...broker,
      demoMode:
        this.config.get<boolean>('DEMO_MODE', false) === true &&
        this.config.get<string>('NODE_ENV') !== 'production',
      permissions: ROLE_PERMISSIONS[broker.role],
      summary: { leads, properties, visits },
    };
  }

  async register(dto: RegisterBrokerDto) {
    const email = dto.email.trim().toLowerCase();
    const name = dto.name.trim();
    const passwordHash = await argon2.hash(dto.password, {
      type: argon2.argon2id,
    });

    try {
      const broker = await this.prisma.broker.create({
        data: { name, email, passwordHash, role: 'BROKER' },
        select: {
          id: true,
          name: true,
          email: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      return broker;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException({
          statusCode: 409,
          code: 'EMAIL_ALREADY_REGISTERED',
          message: 'A broker with this email is already registered',
        });
      }
      throw error;
    }
  }

  async login(dto: LoginDto) {
    const email = dto.email.trim().toLowerCase();
    const broker = await this.prisma.broker.findUnique({ where: { email } });
    const validPassword = broker
      ? await argon2.verify(broker.passwordHash, dto.password)
      : false;

    if (!broker || !validPassword) {
      throw new UnauthorizedException();
    }

    const expiresIn = this.config.getOrThrow<number>('JWT_EXPIRES_IN_SECONDS');
    const accessToken = await this.jwtService.signAsync({ sub: broker.id });

    return {
      accessToken,
      tokenType: 'Bearer' as const,
      expiresIn,
    };
  }
}
