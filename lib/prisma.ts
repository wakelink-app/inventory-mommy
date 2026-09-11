import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const REQUIRED_PART_SHEET_LINE_FIELDS = [
  "searchQuery",
  "imageUrl",
  "imageNote",
  "priceSourceUrl",
  "priceSource",
  "priceAltSourceUrl",
  "priceAltSource",
  "imageSourceUrl",
] as const;

function bustPrismaClientCache() {
  if (process.env.NODE_ENV === "production") return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const resolved = require.resolve("@prisma/client");
    delete require.cache[resolved];
  } catch {
    // ignore
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const resolved = require.resolve(".prisma/client/default");
    delete require.cache[resolved];
  } catch {
    // ignore
  }
}

function createPrisma() {
  bustPrismaClientCache();
  return new PrismaClient();
}

function partSheetLineFieldNames(client: PrismaClient) {
  const fields = (client as PrismaClient & {
    _runtimeDataModel?: { models?: Record<string, { fields?: Record<string, { name?: string }> }> };
  })._runtimeDataModel?.models?.PartSheetLine?.fields;
  if (!fields) return new Set<string>();
  return new Set(Object.values(fields).map((field) => field.name).filter(Boolean) as string[]);
}

function isCurrentPrismaClient(client: PrismaClient) {
  if (typeof client.partSheet?.count !== "function") return false;
  const names = partSheetLineFieldNames(client);
  return REQUIRED_PART_SHEET_LINE_FIELDS.every((field) => names.has(field));
}

function getPrisma(): PrismaClient {
  const current = globalForPrisma.prisma;
  if (current && isCurrentPrismaClient(current)) {
    return current;
  }

  if (current) {
    void current.$disconnect().catch(() => undefined);
  }

  const next = createPrisma();
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = next;
  }
  return next;
}

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = getPrisma();
    const value = Reflect.get(client as object, prop, receiver);
    if (typeof value === "function") {
      return value.bind(client);
    }
    return value;
  },
});
