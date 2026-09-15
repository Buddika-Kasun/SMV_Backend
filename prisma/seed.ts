// import { PrismaClient } from '@prisma/client';
// import * as bcrypt from 'bcryptjs';
// import * as dotenv from 'dotenv';
// import { DEFAULT_USERS } from '../src/shared/default-users';

// dotenv.config();

// const prisma = new PrismaClient();
// const SALT_ROUNDS = 10;

// /**
//  * Ensures the default seed baseline exists (upsert by username). When
//  * `--reset` is passed, removes all non-seed users first (reset-to-defaults).
//  */
// async function main(reset: boolean) {
//   if (reset) {
//     const seedNames = DEFAULT_USERS.map((u) => u.username);
//     const toDelete = await prisma.user.findMany({
//       where: { username: { notIn: seedNames } },
//     });
//     await prisma.user.deleteMany({ where: { id: { in: toDelete.map((u: any) => u.id) } } });
//     console.log(`[seed] Removed ${toDelete.length} non-seed user(s).`);
//   }

//   const seq = await prisma.user.count();
//   let counter = seq;

//   for (const seed of DEFAULT_USERS) {
//     const passwordHash = await bcrypt.hash(seed.password, SALT_ROUNDS);
//     const existing = await prisma.user.findFirst({ where: { username: seed.username } });
//     const id = existing?.id ?? `USR-${String(++counter).padStart(4, '0')}`;

//     await prisma.user.upsert({
//       where: { username: seed.username },
//       create: {
//         id,
//         username: seed.username,
//         passwordHash,
//         fullName: seed.fullName,
//         role: seed.role,
//         designation: seed.designation,
//         email: seed.email,
//         phone: seed.phone,
//       },
//       update: {
//         passwordHash,
//         fullName: seed.fullName,
//         role: seed.role,
//         designation: seed.designation,
//         email: seed.email,
//         phone: seed.phone,
//         isActive: true,
//       },
//     });
//     console.log(`[seed] Upserted user ${seed.username} (${existing ? 'updated' : 'created'})`);
//   }

//   await prisma.$disconnect();
//   console.log('[seed] Done.');
// }

// main(process.argv.includes('--reset'))
//   .catch(async (err) => {
//     console.error('[seed] Failed:', err);
//     await prisma.$disconnect();
//     process.exit(1);
//   });

import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import * as dotenv from "dotenv";
import { DEFAULT_USERS } from "../src/shared/default-users";

dotenv.config();

const prisma = new PrismaClient();
const SALT_ROUNDS = 10;

/**
 * Idempotent seed for the default user baseline.
 *
 * - Only creates users that don't exist.
 * - Never overwrites passwords or roles of existing users.
 * - Deterministic IDs (USR-0001, USR-0002, ...) based on DEFAULT_USERS index.
 * - Pass `--reset` to remove all non-seed users first.
 * - Pass `--force` to update existing users' metadata (not passwords).
 */
async function main(opts: { reset: boolean; force: boolean }) {
  console.log("[seed] Starting...");

  if (opts.reset) {
    const seedNames = DEFAULT_USERS.map((u) => u.username);
    const toDelete = await prisma.user.findMany({
      where: { username: { notIn: seedNames } },
      select: { id: true },
    });
    if (toDelete.length > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: toDelete.map((u) => u.id) } },
      });
    }
    console.log(`[seed] Removed ${toDelete.length} non-seed user(s).`);
  }

  let created = 0;
  let skipped = 0;

  for (let i = 0; i < DEFAULT_USERS.length; i++) {
    const seed = DEFAULT_USERS[i];
    const id = `USR-${String(i + 1).padStart(4, "0")}`;

    const existing = await prisma.user.findUnique({
      where: { username: seed.username },
    });

    if (existing && !opts.force) {
      skipped++;
      continue;
    }

    // Only hash on create (or when forcing), not on plain skip
    const passwordHash = await bcrypt.hash(seed.password, SALT_ROUNDS);

    if (existing) {
      // Force mode — update metadata but keep it opt-in
      await prisma.user.update({
        where: { username: seed.username },
        data: {
          fullName: seed.fullName,
          role: seed.role,
          designation: seed.designation,
          email: seed.email,
          phone: seed.phone,
          isActive: true,
        },
      });
      console.log(`[seed] Updated ${seed.username} (id: ${existing.id})`);
    } else {
      await prisma.user.create({
        data: {
          id,
          username: seed.username,
          passwordHash,
          fullName: seed.fullName,
          role: seed.role,
          designation: seed.designation,
          email: seed.email,
          phone: seed.phone,
          isActive: true,
        },
      });
      console.log(`[seed] Created ${seed.username} (id: ${id})`);
      created++;
    }
  }

  console.log(
    `[seed] Done. Created: ${created}, Skipped (already existed): ${skipped}`,
  );
}

main({
  reset: process.argv.includes("--reset"),
  force: process.argv.includes("--force"),
})
.catch(async (err) => {
  console.error("[seed] Failed:", err);
  await prisma.$disconnect();
  process.exit(1);
})
.finally(async () => {
  await prisma.$disconnect();
});
