import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../config/prisma.service';
import { config } from '../../config/env';
import { User } from '../../shared/types';
import { LoginDto } from './dto/login.dto';

/** Pair of JWTs handed out on login / refresh. */
export interface AuthTokens {
  /** Short-lived JWT sent as `Authorization: Bearer <token>` on API calls. */
  accessToken: string;
  /** Long-lived JWT accepted only by `POST /api/auth/refresh`. */
  refreshToken: string;
}

export interface LoginResult extends AuthTokens {
  /**
   * Legacy alias of `accessToken`, kept so existing clients reading `token`
   * keep working.
   */
  user: Omit<User, 'password'>;
}

interface UserRowLike {
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
}

/** Payload embedded in refresh tokens (`type` marks them as refresh-only). */
interface RefreshTokenPayload {
  sub: string;
  username: string;
  type: 'refresh';
  iat?: number;
  exp?: number;
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

    return this.issueTokens(user);
  }

  /**
   * Exchange a valid refresh token for a freshly-signed access + refresh pair.
   * Rejects forged/expired tokens, tokens signed with the wrong secret
   * (including access tokens), and unknown or deactivated accounts.
   */
  async refresh(refreshToken: string): Promise<LoginResult> {
    let payload: RefreshTokenPayload;
    try {
      payload = (await this.jwt.verifyAsync(refreshToken, {
        secret: config.jwt.refreshSecret,
      })) as RefreshTokenPayload;
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (!payload?.sub || payload.type !== 'refresh') {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User account not found or inactive');
    }

    return this.issueTokens(user);
  }

  async me(userId: string): Promise<Omit<User, 'password'>> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    return this.toPublicUser(user);
  }

  /** Signs both tokens: access with the main secret, refresh with its own. */
  private signTokens(
    user: Pick<UserRowLike, 'id' | 'username' | 'fullName' | 'role' | 'designation'>,
  ): AuthTokens {
    const accessToken = this.jwt.sign({
      sub: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      designation: user.designation,
    });

    // Separate secret + explicit expiry so refresh tokens are unusable at
    // regular endpoints (JwtAuthGuard verifies with the access secret).
    const refreshToken = this.jwt.sign(
      {
        sub: user.id,
        username: user.username,
        type: 'refresh' as const,
      },
      {
        secret: config.jwt.refreshSecret,
        expiresIn: config.jwt.refreshExpiresIn as any,
      },
    );

    return { accessToken, refreshToken };
  }

  private issueTokens(user: UserRowLike): LoginResult {
    const tokens = this.signTokens(user);
    return {
      ...tokens,
      user: this.toPublicUser(user),
    };
  }

  private toPublicUser(user: UserRowLike): Omit<User, 'password'> {
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