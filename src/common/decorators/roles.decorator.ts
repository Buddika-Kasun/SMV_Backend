import { SetMetadata, CustomDecorator } from '@nestjs/common';
import { UserRole } from '../../shared/types';

export const ROLES_KEY = 'roles';

/**
 * Declares the roles allowed to access a handler or controller class.
 * @example @Roles('admin', 'manager')
 */
export const Roles = (...roles: UserRole[]): CustomDecorator => SetMetadata(ROLES_KEY, roles);