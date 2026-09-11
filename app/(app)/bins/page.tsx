import { BinsClient } from "@/components/BinsClient";
import { requirePageAuth } from "@/lib/auth";
import { getInventory } from "@/lib/catalog";
import { ensureBinCodes, listBins, listLocationTree } from "@/lib/locations";
import { photoUrl } from "@/lib/uploads";

export const dynamic = "force-dynamic";

export default async function BinsPage() {
  const user = await requirePageAuth();
  await ensureBinCodes(user.id);
  const tree = await listLocationTree(user.id);
  const items = await getInventory({ tab: "inventory" }, user.id);
  const bins = listBins(tree);
  return (
    <BinsClient
      bins={JSON.parse(JSON.stringify(bins))}
      items={JSON.parse(
        JSON.stringify(
          items.map((item) => ({
            id: item.id,
            sku: item.sku,
            title: item.title,
            locationId: item.locationId,
            photos: item.photos.map((photo) => ({
              url: photoUrl(photo.filename),
              isPrimary: photo.isPrimary,
            })),
          })),
        ),
      )}
    />
  );
}
