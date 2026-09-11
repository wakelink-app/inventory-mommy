/**
 * One-time migrate: add User/Session + userId columns, create owner, backfill existing rows.
 * Run: npx tsx scripts/migrate-accounts.ts
 */
import { createHash, randomBytes } from "crypto";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DEFAULT_OWNER_EMAIL = "grossmanshimon1@gmail.com";

function id() {
  return `c${randomBytes(12).toString("hex")}`;
}

async function tableExists(name: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
    name,
  );
  return rows.length > 0;
}

async function columnExists(table: string, column: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ name: string }>>(`PRAGMA table_info("${table}")`);
  return rows.some((row) => row.name === column);
}

async function ensureEmailColumn() {
  if (!(await tableExists("User"))) return;

  const hasEmail = await columnExists("User", "email");
  const hasUsername = await columnExists("User", "username");

  if (hasEmail) return;

  if (hasUsername) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "User" RENAME COLUMN "username" TO "email"`);
    await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "User_username_key"`);
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email")`);
    console.log("Renamed User.username -> User.email");
    return;
  }

  await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN "email" TEXT`);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email")`);
  console.log("Added User.email");
}

async function main() {
  const email = (process.env.OWNER_EMAIL || process.env.OWNER_USERNAME || DEFAULT_OWNER_EMAIL)
    .trim()
    .toLowerCase();
  const password =
    process.env.OWNER_PASSWORD?.trim() ||
    process.env.APP_PASSWORD?.trim() ||
    "inventorymommy";

  console.log("Migrating accounts…");

  if (!(await tableExists("User"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE "User" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "email" TEXT NOT NULL,
        "passwordHash" TEXT NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX "User_email_key" ON "User"("email")`);
    console.log("Created User table");
  } else {
    await ensureEmailColumn();
  }

  if (!(await tableExists("Session"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE "Session" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "token" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "expiresAt" DATETIME NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token")`);
    console.log("Created Session table");
  }

  for (const table of ["Location", "Item", "CustomLabel", "CaptureSession"] as const) {
    if (!(await columnExists(table, "userId"))) {
      await prisma.$executeRawUnsafe(`ALTER TABLE "${table}" ADD COLUMN "userId" TEXT`);
      console.log(`Added ${table}.userId`);
    }
  }

  const existing = await prisma.$queryRawUnsafe<Array<{ id: string; email: string }>>(
    `SELECT id, email FROM "User" WHERE email = ? LIMIT 1`,
    email,
  );
  let ownerId = existing[0]?.id;
  if (!ownerId) {
    const legacyAdmin = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM "User" WHERE email IN ('admin', 'owner') LIMIT 1`,
    );
    ownerId = legacyAdmin[0]?.id;
    if (ownerId) {
      await prisma.$executeRawUnsafe(`UPDATE "User" SET email = ? WHERE id = ?`, email, ownerId);
      console.log(`Updated owner email to "${email}"`);
    } else {
      ownerId = id();
      const passwordHash = await bcrypt.hash(password, 12);
      await prisma.$executeRawUnsafe(
        `INSERT INTO "User" ("id", "email", "passwordHash", "createdAt") VALUES (?, ?, ?, datetime('now'))`,
        ownerId,
        email,
        passwordHash,
      );
      console.log(`Created owner user "${email}"`);
    }
  } else {
    console.log(`Owner user "${email}" already exists`);
  }

  await prisma.$executeRawUnsafe(`UPDATE "Item" SET "userId" = ? WHERE "userId" IS NULL`, ownerId);
  await prisma.$executeRawUnsafe(`UPDATE "Location" SET "userId" = ? WHERE "userId" IS NULL`, ownerId);
  await prisma.$executeRawUnsafe(`UPDATE "CustomLabel" SET "userId" = ? WHERE "userId" IS NULL`, ownerId);
  await prisma.$executeRawUnsafe(`UPDATE "CaptureSession" SET "userId" = ? WHERE "userId" IS NULL`, ownerId);
  console.log("Backfilled existing rows to owner");

  try {
    await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "Location_code_key"`);
  } catch {
    /* ignore */
  }
  try {
    await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "CustomLabel_code_key"`);
  } catch {
    /* ignore */
  }
  try {
    await prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "Location_userId_code_key" ON "Location"("userId", "code")`,
    );
  } catch (err) {
    console.warn("Location composite unique:", err);
  }
  try {
    await prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "CustomLabel_userId_code_key" ON "CustomLabel"("userId", "code")`,
    );
  } catch (err) {
    console.warn("CustomLabel composite unique:", err);
  }

  const stamp = createHash("sha1").update(`${ownerId}:${email}`).digest("hex").slice(0, 8);
  console.log(`Done. Login as "${email}". stamp=${stamp}`);
  if (!process.env.OWNER_PASSWORD && !process.env.APP_PASSWORD) {
    console.log(`Password (default): inventorymommy`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
