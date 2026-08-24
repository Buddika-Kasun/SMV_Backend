import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../config/prisma.service';
import { User, UserRole } from '../../shared/types';
import { DEFAULT_USERS } from '../../shared/default-users';
import { userId } from '../../common/utils/id';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

const SALT_ROUNDS = 10;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<Omit<User, 'password'>[]> {
    const rows = await this.prisma.user.findMany({ orderBy: { createdAt: 'asc' } });
    return rows.map(this.toPublicUser);
  }

  async create(input: CreateUserDto): Promise<Omit<User, 'password'>> {
    const existing = await this.prisma.user.findUnique({
      where: { username: input.username },
    });
    if (existing) {
      throw new ConflictException(`Username '${input.username}' is already taken`);
    }

    await this.assertSingleActiveAdmin(input.role);
    const seq = await this.prisma.user.count();

    const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
    const row = await this.prisma.user.create({
      data: {
        id: userId(seq + 1),
        username: input.username,
        passwordHash,
        fullName: input.fullName,
        role: input.role,
        designation: input.designation,
        email: input.email ?? null,
        phone: input.phone ?? null,
      },
    });
    return this.toPublicUser(row);
  }

  async update(id: string, input: UpdateUserDto): Promise<Omit<User, 'password'>> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    // If promoting/activating an admin, enforce the single-active-admin rule.
    const nextRole: string = input.role ?? user.role;
    const nextActive = input.isActive ?? user.isActive;
    if (nextRole === 'admin' && nextActive && user.role !== 'admin') {
      await this.assertSingleActiveAdmin('admin', id);
    }

    const data: Record<string, unknown> = {};
    if (input.role !== undefined) data.role = input.role;
    if (input.fullName !== undefined) data.fullName = input.fullName;
    if (input.email !== undefined) data.email = input.email ?? null;
    if (input.phone !== undefined) data.phone = input.phone ?? null;
    if (input.designation !== undefined) data.designation = input.designation;
    if (input.isActive !== undefined) data.isActive = input.isActive;
    if (input.password !== undefined) {
      data.passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
    }

    const updated = await this.prisma.user.update({ where: { id }, data });
    return this.toPublicUser(updated);
  }

  async remove(id: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    if (user.role === 'admin') {
      const activeAdmins = await this.prisma.user.count({
        where: { role: 'admin', isActive: true },
      });
      if (activeAdmins <= 1) {
        throw new BadRequestException('Cannot delete the last active admin account');
      }
    }
    await this.prisma.user.delete({ where: { id } });
  }

  async resetDefaults(): Promise<Omit<User, 'password'>[]> {
    // Remove all non-seed users, then re-ensure the seed baseline.
    const seedNames = DEFAULT_USERS.map((u) => u.username);
    await this.prisma.user.deleteMany({ where: { username: { notIn: seedNames } } });

    let counter = await this.prisma.user.count();
    for (const seed of DEFAULT_USERS) {
      counter += 1;
      await this.prisma.user.upsert({
        where: { username: seed.username },
        create: {
          id: userId(counter),
          username: seed.username,
          passwordHash: await bcrypt.hash(seed.password, SALT_ROUNDS),
          fullName: seed.fullName,
          role: seed.role,
          designation: seed.designation,
          email: seed.email ?? null,
          phone: seed.phone ?? null,
          isActive: true,
        },
        update: {
          passwordHash: await bcrypt.hash(seed.password, SALT_ROUNDS),
          fullName: seed.fullName,
          role: seed.role,
          designation: seed.designation,
          email: seed.email ?? null,
          phone: seed.phone ?? null,
          isActive: true,
        },
      });
    }
    return this.findAll();
  }

  private async assertSingleActiveAdmin(role: UserRole, excludeId?: string): Promise<void> {
    if (role !== 'admin') return;
    const activeAdmins = await this.prisma.user.count({
      where: { role: 'admin', isActive: true, NOT: excludeId ? { id: excludeId } : undefined },
    });
    if (activeAdmins >= 1) {
      throw new BadRequestException('Only one active admin account is permitted');
    }
  }

  private toPublicUser(row: {
    id: string;
    username: string;
    fullName: string;
    role: string;
    designation: string;
    email: string | null;
    phone: string | null;
    isActive: boolean;
    createdAt: Date;
    lastLogin: Date | null;
  }): Omit<User, 'password'> {
    return {
      id: row.id,
      username: row.username,
      fullName: row.fullName,
      role: row.role as UserRole,
      designation: row.designation,
      email: row.email ?? undefined,
      phone: row.phone ?? undefined,
      isActive: row.isActive,
      createdAt: row.createdAt.toISOString(),
      lastLogin: row.lastLogin?.toISOString(),
    };
  }
}