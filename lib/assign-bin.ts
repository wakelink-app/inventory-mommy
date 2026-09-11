import { prisma } from "./prisma";
import { itemInclude, locationLabelsFor, serializeItem } from "./catalog";

/** Move an item (or a portion of its quantity) into a bin. Partial qty splits into a new row. */
export async function assignItemToBin(
  itemId: string,
  locationId: string,
  assignQuantity?: number,
  userId?: string,
) {
  const existing = await prisma.item.findFirst({
    where: { id: itemId, ...(userId ? { userId } : {}) },
    include: itemInclude,
  });
  if (!existing) return null;

  const ownerId = existing.userId;
  const bin = await prisma.location.findFirst({
    where: { id: locationId, userId: ownerId },
  });
  if (!bin) return null;

  const available = Math.max(1, existing.quantity || 1);
  const take = Math.min(Math.max(1, Math.round(assignQuantity ?? available) || 1), available);

  if (take >= available) {
    const item = await prisma.item.update({
      where: { id: itemId },
      data: { locationId },
      include: itemInclude,
    });
    const labels = await locationLabelsFor([item.locationId], ownerId);
    return serializeItem(item, labels);
  }

  await prisma.item.update({
    where: { id: itemId },
    data: { quantity: available - take },
  });

  const split = await prisma.item.create({
    data: {
      sku: existing.sku,
      title: existing.title,
      brand: existing.brand,
      model: existing.model,
      condition: existing.condition,
      category: existing.category,
      notes: existing.notes,
      status: existing.status,
      quantity: take,
      locationId,
      userId: ownerId,
      photos: {
        create: existing.photos.map((photo) => ({
          filename: photo.filename,
          isPrimary: photo.isPrimary,
        })),
      },
      ...(existing.draft
        ? {
            draft: {
              create: {
                title: existing.draft.title,
                description: existing.draft.description,
                categoryId: existing.draft.categoryId,
                suggestedPrice: existing.draft.suggestedPrice,
                condition: existing.draft.condition,
                status: existing.draft.status,
              },
            },
          }
        : {}),
    },
    include: itemInclude,
  });

  const labels = await locationLabelsFor([split.locationId], ownerId);
  return serializeItem(split, labels);
}
