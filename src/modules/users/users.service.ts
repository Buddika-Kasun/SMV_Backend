import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  InternalServerErrorException,
  Inject,
} from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../../config/prisma.service";
import { User, UserRole } from "../../shared/types";
import { DEFAULT_USERS } from "../../shared/default-users";
import { userId } from "../../common/utils/id";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { PaginationDto } from "../../common/dto/pagination.dto";
import { PaginationService } from "../../common/services/pagination.service";
import { EventBusService } from "../event/event-bus.service";

const SALT_ROUNDS = 10;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paginationService: PaginationService,
    private readonly eventBus: EventBusService,
  ) {}

  async findAll(paginationDto: PaginationDto) {
    try {
      // Build where clause with search
      const where: any = {};

      if (paginationDto.search) {
        where.OR = [
          { username: { contains: paginationDto.search, mode: "insensitive" } },
          { fullName: { contains: paginationDto.search, mode: "insensitive" } },
          { email: { contains: paginationDto.search, mode: "insensitive" } },
        ];
      }

      // Get pagination options
      const options = this.paginationService.getPaginationOptions(
        paginationDto,
        "createdAt",
        "desc",
      );

      // Add role filter
      if (paginationDto.role) {
        where.role = paginationDto.role;
      }

      // Get total count
      const total = await this.prisma.user.count({ where });

      // Get paginated results
      const rows = await this.prisma.user.findMany({
        where,
        orderBy: { [options.sortBy]: options.sortOrder },
        skip: options.skip,
        take: options.limit,
      });

      const items = rows.map(this.toPublicUser);

      // Return paginated response
      return this.paginationService.createPaginatedResponse(
        items,
        total,
        options.page,
        options.limit,
      );
    } catch (error) {
      throw new InternalServerErrorException(
        `Failed to retrieve users: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  // Other methods remain the same...
  async create(input: CreateUserDto): Promise<Omit<User, "password">> {
    try {
      const existing = await this.prisma.user.findUnique({
        where: { username: input.username },
      });
      if (existing) {
        throw new ConflictException(
          `Username '${input.username}' is already taken`,
        );
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

      await this.eventBus.publish({
        type: "users.changed",
        payload: {},
      });

      return this.toPublicUser(row);
    } catch (error) {
      if (
        error instanceof ConflictException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Failed to create user: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  async update(
    id: string,
    input: UpdateUserDto,
  ): Promise<Omit<User, "password">> {
    try {
      const user = await this.prisma.user.findUnique({ where: { id } });
      if (!user) {
        throw new NotFoundException(`User with ID ${id} not found`);
      }

      const nextRole: string = input.role ?? user.role;
      const nextActive = input.isActive ?? user.isActive;
      if (nextRole === "admin" && nextActive && user.role !== "admin") {
        await this.assertSingleActiveAdmin("admin", id);
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
      
      await this.eventBus.publish({
        type: "users.changed",
        payload: {},
      });

      return this.toPublicUser(updated);
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Failed to update user: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  async remove(id: string): Promise<void> {
    try {
      const user = await this.prisma.user.findUnique({ where: { id } });
      if (!user) {
        throw new NotFoundException(`User with ID ${id} not found`);
      }

      if (user.role === "admin") {
        const activeAdmins = await this.prisma.user.count({
          where: { role: "admin", isActive: true },
        });
        if (activeAdmins <= 1) {
          throw new BadRequestException(
            "Cannot delete the last active admin account",
          );
        }
      }

      await this.eventBus.publish({
        type: "users.changed",
        payload: {},
      });

      await this.prisma.user.delete({ where: { id } });
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Failed to delete user: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  async resetDefaults(): Promise<Omit<User, "password">[]> {
    try {
      const seedNames = DEFAULT_USERS.map((u) => u.username);
      await this.prisma.user.deleteMany({
        where: { username: { notIn: seedNames } },
      });

      let counter = await this.prisma.user.count();
      const createdUsers = [];

      for (const seed of DEFAULT_USERS) {
        counter += 1;
        const result = await this.prisma.user.upsert({
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
        createdUsers.push(result);
      }

      await this.eventBus.publish({
        type: "users.changed",
        payload: {},
      });

      return createdUsers.map(this.toPublicUser);
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Failed to reset defaults: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  private async assertSingleActiveAdmin(
    role: UserRole,
    excludeId?: string,
  ): Promise<void> {
    try {
      if (role !== "admin") return;
      const activeAdmins = await this.prisma.user.count({
        where: {
          role: "admin",
          isActive: true,
          NOT: excludeId ? { id: excludeId } : undefined,
        },
      });
      if (activeAdmins >= 1) {
        throw new BadRequestException(
          "Only one active admin account is permitted",
        );
      }
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Failed to validate admin constraint: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
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
  }): Omit<User, "password"> {
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
