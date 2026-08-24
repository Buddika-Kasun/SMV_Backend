import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as dotenv from 'dotenv';
import { DEFAULT_USERS } from '../src/shared/default-users';

dotenv.config();

const prisma = new PrismaClient();
const SALT_ROUNDS = 10;

/**
 * Ensures the default seed baseline exists (upsert by username). When
 * `--reset` is passed, removes all non-seed users first (reset-to-defaults).
 */
async function main(reset: boolean) {
  if (reset) {
    const seedNames = DEFAULT_USERS.map((u) => u.username);
    const toDelete = await prisma.user.findMany({
      where: { username: { notIn: seedNames } },
    });
    await prisma.user.deleteMany({ where: { id: { in: toDelete.map((u: any) => u.id) } } });
    console.log(`[seed] Removed ${toDelete.length} non-seed user(s).`);
  }

  const seq = await prisma.user.count();
  let counter = seq;

  for (const seed of DEFAULT_USERS) {
    const passwordHash = await bcrypt.hash(seed.password, SALT_ROUNDS);
    const existing = await prisma.user.findFirst({ where: { username: seed.username } });
    const id = existing?.id ?? `USR-${String(++counter).padStart(4, '0')}`;

    await prisma.user.upsert({
      where: { username: seed.username },
      create: {
        id,
        username: seed.username,
        passwordHash,
        fullName: seed.fullName,
        role: seed.role,
        designation: seed.designation,
        email: seed.email,
        phone: seed.phone,
      },
      update: {
        passwordHash,
        fullName: seed.fullName,
        role: seed.role,
        designation: seed.designation,
        email: seed.email,
        phone: seed.phone,
        isActive: true,
      },
    });
    console.log(`[seed] Upserted user ${seed.username} (${existing ? 'updated' : 'created'})`);
  }

  await prisma.$disconnect();
  console.log('[seed] Done.');
}

main(process.argv.includes('--reset'))
  .catch(async (err) => {
    console.error('[seed] Failed:', err);
    await prisma.$disconnect();
    process.exit(1);
  });