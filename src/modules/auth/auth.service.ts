import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../config/prisma.service';
import { User } from '../../shared/types';
import { LoginDto } from './dto/login.dto';

export interface LoginResult {
  token: string;
  user: Omit<User, 'password'>;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(input: LoginDto): Promise<LoginResult> {
    const user = await this.prisma.user.findUnique({ where: { username: input.username } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid username or password');
    }

    const valid = await bcrypt.compare(input.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid username or password');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    });

    const token = this.jwt.sign({
      sub: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      designation: user.designation,
    });

    return { token, user: this.toPublicUser(user) };
  }

  async me(userId: string): Promise<Omit<User, 'password'>> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    return this.toPublicUser(user);
  }

  private toPublicUser(user: {
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
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role as User['role'],
      designation: user.designation,
      email: user.email ?? undefined,
      phone: user.phone ?? undefined,
      isActive: user.isActive,
      createdAt: user.createdAt.toISOString(),
      lastLogin: user.lastLogin?.toISOString(),
    };
  }
}