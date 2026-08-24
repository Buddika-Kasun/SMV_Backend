import { UserRole } from './types';

export interface SeedUser {
  username: string;
  password: string;
  fullName: string;
  role: UserRole;
  designation: string;
  email?: string;
  phone?: string;
}

/**
 * Default seed baseline users. Used by both `prisma/seed.ts` and the
 * `POST /api/users/reset-defaults` endpoint.
 */
export const DEFAULT_USERS: SeedUser[] = [
  {
    username: 'sysadmin',
    password: 'Admin@123',
    fullName: 'System Admin',
    role: 'admin',
    designation: 'Chief Technology Officer',
    email: 'admin@smvholdings.lk',
    phone: '+94 77 123 4567',
  },
  {
    username: 'mgr_perera',
    password: 'Manager@123',
    fullName: 'Nimal Perera',
    role: 'manager',
    designation: 'Branch Manager',
    email: 'nimal.perera@smvholdings.lk',
    phone: '+94 77 234 5678',
  },
  {
    username: 'staff_jay',
    password: 'Staff@123',
    fullName: 'Jayashan Fernando',
    role: 'staff',
    designation: 'Loan Officer',
    email: 'jay.fernando@smvholdings.lk',
    phone: '+94 77 345 6789',
  },
];