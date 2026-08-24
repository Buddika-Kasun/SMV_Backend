import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthedUser, AUTH_HEADER, BEARER_PREFIX } from './auth.types';

/**
 * Verifies the `Authorization: Bearer <token>` header and attaches the parsed
 * JWT payload to `request.user`. Applied with `@UseGuards(JwtAuthGuard)`.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(executionContext: ExecutionContext): Promise<boolean> {
    const req = executionContext.switchToHttp().getRequest<Request & { user?: AuthedUser }>();
    const auth = req.headers[AUTH_HEADER] ?? req.headers['Authorization'];
    if (!auth || !auth.startsWith(BEARER_PREFIX)) {
      throw new UnauthorizedException('Authentication token missing');
    }

    const token = auth.slice(BEARER_PREFIX.length);
    try {
      const payload = this.jwtService.verify(token);
      req.user = payload as unknown as AuthedUser;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}