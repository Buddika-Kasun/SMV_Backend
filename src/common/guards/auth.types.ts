import { UserRole } from '../../shared/types';

/**
 * Shape attached to `request.user` by JwtAuthGuard after a valid token verify.
 */
export interface AuthedUser {
  sub: string; // user id
  username: string;
  fullName: string;
  role: UserRole;
  designation: string;
  iat: number;
  exp: number;
}

export const AUTH_HEADER = 'authorization';
export const BEARER_PREFIX = 'Bearer ';