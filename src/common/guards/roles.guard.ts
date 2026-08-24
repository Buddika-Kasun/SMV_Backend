import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../../shared/types';
import { ROLES_KEY } from '../decorators/roles.decorator';

/**
 * Enforces role-based access on a handler. Read the roles declared via
 * `@Roles(...)` and rejects the request when the authenticated user's role
 * is not permitted. Meant to be stacked after JwtAuthGuard.
 *
 * @example @UseGuards(JwtAuthGuard, RolesGuard) @Roles('admin', 'manager')
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(executionContext: ExecutionContext): Promise<boolean> {
    const roles = this.reflector.get<UserRole[] | undefined>(
      ROLES_KEY,
      executionContext.getHandler(),
    );
    if (!roles || roles.length === 0) return true;

    const req = executionContext.switchToHttp().getRequest<Request & { user?: { role?: UserRole } }>();
    const role = req.user?.role;
    if (!role || roles.indexOf(role) < 0) {
      throw new ForbiddenException('You do not have permission to perform this action');
    }
    return true;
  }
}