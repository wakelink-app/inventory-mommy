import { prisma } from "./prisma";
import { listLocationTree, locationLabel } from "./locations";
import { ensureAppleWatchSkus } from "./sku";
import { photoUrl } from "./uploads";

export { nextSku } from "./sku";

export const itemInclude = {
  photos: { orderBy: { createdAt: "asc" as const } },
  draft: true,
  location: true,
};

export async function locationLabelsFor(
  locationIds: (string | null | undefined)[],
  userId: string,
): Promise<Map<string, string>> {
  const tree = await listLocationTree(userId);
  const labels = new Map<string, string>();
  for (const id of locationIds) {
    if (id && !labels.has(id)) {
      labels.set(id, locationLabel(tree, id) ?? "");
    }
  }
  return labels;
}

export function serializeItem<
  T extends { locationId: string | null; photos: { filename: string }[] },
>(item: T, labels: Map<string, string>) {
  return {
    ...item,
    locationLabel: item.locationId ? labels.get(item.locationId) ?? null : null,
    photos: item.photos.map((photo) => ({
      ...photo,
      url: photoUrl(photo.filename),
    })),
  };
}

export async function getInventory(
  filters: {
    q?: string;
    status?: string;
    locationId?: string;
    tab?: string;
  },
  userId: string,
) {
  await ensureAppleWatchSkus(userId);
  const q = filters.q?.trim() ?? "";
  const status = filters.status?.trim() ?? "";
  const locationId = filters.locationId?.trim() ?? "";
  const tab = filters.tab?.trim() ?? "";
  const orderStatuses = ["ordered", "packaged", "shipped", "sold"];
  const offInventory = [...orderStatuses, "returned"];
  const tabWhere =
    tab === "listed"
      ? { status: "listed" }
      : tab === "ordered"
        ? { status: "ordered" }
        : tab === "packaged"
          ? { status: "packaged" }
          : tab === "shipped"
            ? { status: { in: ["shipped", "sold"] } }
            : tab === "returned"
              ? { status: "returned" }
              : tab === "orders"
                ? { status: { in: orderStatuses } }
                : tab === "unlisted"
                  ? { status: { in: ["stored", "inbound"] } }
                  : tab === "draft"
                    ? { status: { in: ["stored", "inbound"] }, draft: { status: "draft" } }
                    : tab === "inventory"
                      ? { status: { notIn: offInventory } }
                      : {};
  const items = await prisma.item.findMany({
    where: {
      userId,
      ...tabWhere,
      ...(status ? { status } : {}),
      ...(locationId ? { locationId } : {}),
    },
    include: itemInclude,
    orderBy: { updatedAt: "desc" },
  });
  const labels = await locationLabelsFor(
    items.map((item) => item.locationId),
    userId,
  );
  const serialized = items.map((item) => serializeItem(item, labels));
  if (!q) return serialized;

  const needle = q.toLowerCase();
  return serialized.filter((item) => {
    const sku = item.sku || `P${item.id.slice(-4).toUpperCase()}`;
    return [sku, item.title, item.brand, item.model, item.notes, item.category, item.locationLabel].some((value) =>
      String(value ?? "")
        .toLowerCase()
        .includes(needle),
    );
  });
}

export async function getItemById(id: string, userId: string) {
  await ensureAppleWatchSkus(userId);
  const item = await prisma.item.findFirst({
    where: { id, userId },
    include: itemInclude,
  });
  if (!item) return null;
  const labels = await locationLabelsFor([item.locationId], userId);
  return serializeItem(item, labels);
}

export async function getDashboard(userId: string) {
  const items = await getInventory({}, userId);
  const orderStatuses = new Set(["ordered", "packaged", "shipped", "sold"]);
  const inventory = items.filter((item) => !orderStatuses.has(item.status) && item.status !== "returned");
  const listed = inventory.filter((item) => item.status === "listed");
  const orders = items.filter((item) => orderStatuses.has(item.status));
  const soldLike = items.filter((item) => orderStatuses.has(item.status) || item.status === "returned");
  const revenue = soldLike.reduce((sum, item) => sum + (item.draft?.suggestedPrice ?? 0), 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todaySales = orders
    .filter((item) => new Date(item.updatedAt).getTime() >= today.getTime())
    .reduce((sum, item) => sum + (item.draft?.suggestedPrice ?? 0), 0);

  return {
    total: inventory.length,
    listed: listed.length,
    orders: orders.length,
    revenue,
    todaySales,
    recent: orders.slice(0, 8),
    pickQueue: listed.slice(0, 8),
  };
}

export async function getDrafts(userId: string) {
  const drafts = await prisma.listingDraft.findMany({
    where: { item: { userId } },
    include: {
      item: { include: { photos: true, location: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
  const labels = await locationLabelsFor(
    drafts.map((d) => d.item.locationId),
    userId,
  );
  return drafts.map((draft) => ({
    ...draft,
    item: serializeItem(draft.item, labels),
  }));
}
