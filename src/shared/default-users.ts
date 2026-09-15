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
    username: "sysadmin",
    password: "Admin@123",
    fullName: "System Admin",
    role: "admin",
    designation: "Chief Technology Officer",
    email: "admin@smvholdings.lk",
    phone: "+94 71 531 5915",
  },
  {
    username: "manager",
    password: "Manager@123",
    fullName: "Test Manager",
    role: "manager",
    designation: "Branch Manager",
    email: "test.manager@smvholdings.lk",
    phone: "+94 71 531 5915",
  },
  {
    username: "staff",
    password: "Staff@123",
    fullName: "Test Staff",
    role: "staff",
    designation: "Loan Officer",
    email: "test.staff@smvholdings.lk",
    phone: "+94 71 531 5915",
  },
];