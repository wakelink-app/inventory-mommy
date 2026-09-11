import { prisma } from "./prisma";
import type { LocationNode, LocationSuggestion } from "./types";

function toNode(
  loc: {
    id: string;
    name: string;
    code: string | null;
    type: string;
    parentId: string | null;
    defaultCategory: string | null;
    _count: { items: number };
  },
  children: LocationNode[],
): LocationNode {
  return {
    id: loc.id,
    name: loc.name,
    code: loc.code,
    type: loc.type === "box" ? "box" : "shelf",
    parentId: loc.parentId,
    defaultCategory: loc.defaultCategory,
    itemCount: loc._count.items + children.reduce((sum, c) => sum + c.itemCount, 0),
    children,
  };
}

export async function nextBinCode(userId: string): Promise<string> {
  const locations = await prisma.location.findMany({
    where: { userId, code: { startsWith: "B" } },
    select: { code: true },
  });
  let max = 0;
  for (const loc of locations) {
    const match = loc.code?.match(/^B(\d+)$/i);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `B${String(max + 1).padStart(4, "0")}`;
}

export async function ensureBinCodes(userId: string) {
  const missing = await prisma.location.findMany({
    where: { userId, type: "box", code: null },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (missing.length === 0) return;
  const locations = await prisma.location.findMany({
    where: { userId, code: { startsWith: "B" } },
    select: { code: true },
  });
  let max = 0;
  for (const loc of locations) {
    const match = loc.code?.match(/^B(\d+)$/i);
    if (match) max = Math.max(max, Number(match[1]));
  }
  for (const bin of missing) {
    max += 1;
    await prisma.location.update({
      where: { id: bin.id },
      data: { code: `B${String(max).padStart(4, "0")}` },
    });
  }
}

export async function listLocationTree(userId: string): Promise<LocationNode[]> {
  const all = await prisma.location.findMany({
    where: { userId },
    include: { _count: { select: { items: true } } },
    orderBy: { name: "asc" },
  });

  const byParent = new Map<string | null, typeof all>();
  for (const loc of all) {
    const key = loc.parentId;
    const list = byParent.get(key) ?? [];
    list.push(loc);
    byParent.set(key, list);
  }

  const build = (parentId: string | null): LocationNode[] => {
    const nodes = byParent.get(parentId) ?? [];
    return nodes.map((loc) => toNode(loc, build(loc.id)));
  };

  return build(null);
}

export function flattenLocations(tree: LocationNode[]): LocationNode[] {
  const out: LocationNode[] = [];
  const walk = (nodes: LocationNode[]) => {
    for (const node of nodes) {
      out.push(node);
      walk(node.children);
    }
  };
  walk(tree);
  return out;
}

export function listBins(tree: LocationNode[]) {
  return flattenLocations(tree)
    .filter((node) => node.type === "box")
    .map((node) => ({
      id: node.id,
      name: node.name,
      code: node.code,
      label: locationLabel(tree, node.id) ?? node.name,
    }));
}

export function locationLabel(tree: LocationNode[], id: string): string | null {
  const find = (nodes: LocationNode[]): LocationNode | null => {
    for (const node of nodes) {
      if (node.id === id) return node;
      const nested = find(node.children);
      if (nested) return nested;
    }
    return null;
  };
  const node = find(tree);
  if (!node) return null;
  if (node.type === "box" && node.parentId) {
    const parent = findPath(tree, node.parentId);
    return parent ? `${parent.name} / ${node.name}` : node.name;
  }
  return node.name;
}

function findPath(nodes: LocationNode[], id: string): LocationNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const nested = findPath(node.children, id);
    if (nested) return nested;
  }
  return null;
}

export async function suggestLocation(
  input: {
    brand?: string | null;
    category?: string | null;
  },
  userId: string,
): Promise<LocationSuggestion> {
  const brand = input.brand?.trim();
  const category = input.category?.trim();
  const tree = await listLocationTree(userId);
  const flat = flattenLocations(tree);

  if (category) {
    const byDefault = flat.find(
      (loc) =>
        loc.defaultCategory &&
        loc.defaultCategory.toLowerCase() === category.toLowerCase(),
    );
    if (byDefault) {
      return {
        locationId: byDefault.id,
        label: locationLabel(tree, byDefault.id),
        reason: `Default box for ${category}`,
      };
    }
    const loose = flat.find(
      (loc) =>
        loc.defaultCategory &&
        (category.toLowerCase().includes(loc.defaultCategory.toLowerCase()) ||
          loc.defaultCategory.toLowerCase().includes(category.toLowerCase())),
    );
    if (loose) {
      return {
        locationId: loose.id,
        label: locationLabel(tree, loose.id),
        reason: `Matches category default (${loose.defaultCategory})`,
      };
    }
  }

  if (brand) {
    const similar = await prisma.item.findFirst({
      where: {
        userId,
        brand: { equals: brand },
        locationId: { not: null },
      },
      orderBy: { updatedAt: "desc" },
      include: { location: true },
    });
    if (similar?.locationId) {
      return {
        locationId: similar.locationId,
        label: locationLabel(tree, similar.locationId),
        reason: `Other ${brand} items are stored here`,
      };
    }
  }

  if (category) {
    const similar = await prisma.item.findFirst({
      where: {
        userId,
        category: { equals: category },
        locationId: { not: null },
      },
      orderBy: { updatedAt: "desc" },
    });
    if (similar?.locationId) {
      return {
        locationId: similar.locationId,
        label: locationLabel(tree, similar.locationId),
        reason: `Other items in ${category} are stored here`,
      };
    }
  }

  return { locationId: null, label: null, reason: null };
}
