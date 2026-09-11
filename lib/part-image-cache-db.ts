import { prisma } from "./prisma";

export type PartImageCacheKey = {
  brand: string;
  modelNum: string;
  partType: string;
};

export async function lookupCachedPartImage(key: PartImageCacheKey): Promise<string | null> {
  const row = await prisma.partImageCache.findUnique({
    where: {
      brand_modelNum_partType: {
        brand: key.brand,
        modelNum: key.modelNum,
        partType: key.partType,
      },
    },
  });
  return row?.imageUrl ?? null;
}

export async function upsertCachedPartImage(
  key: PartImageCacheKey,
  imageUrl: string,
  source: string,
) {
  await prisma.partImageCache.upsert({
    where: {
      brand_modelNum_partType: {
        brand: key.brand,
        modelNum: key.modelNum,
        partType: key.partType,
      },
    },
    create: {
      brand: key.brand,
      modelNum: key.modelNum,
      partType: key.partType,
      imageUrl,
      source,
    },
    update: {
      imageUrl,
      source,
    },
  });
}
