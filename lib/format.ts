export function money(value: number | null | undefined, currency = "USD"): string {
  if (value == null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

export function statusLabel(status: string): string {
  switch (status) {
    case "inbound":
      return "Unlisted";
    case "stored":
      return "Unlisted";
    case "listed":
      return "Listed";
    case "ordered":
      return "Ordered";
    case "packaged":
      return "Packaged";
    case "sold":
    case "shipped":
      return "Shipped";
    case "returned":
      return "Returned";
    case "draft":
      return "Draft";
    case "paid":
      return "Paid";
    default:
      return status;
  }
}

export function inventoryTab(status: string, draftStatus?: string | null): string {
  if (status === "listed") return "listed";
  if (status === "returned") return "returned";
  if (isOrderStatus(status)) return orderStage(status);
  if (draftStatus === "draft") return "draft";
  return "unlisted";
}

export function isOrderStatus(status: string): boolean {
  return status === "ordered" || status === "packaged" || status === "shipped" || status === "sold";
}

export function isOffInventory(status: string): boolean {
  return isOrderStatus(status) || status === "returned";
}

export function orderStage(status: string): "ordered" | "packaged" | "shipped" {
  if (status === "packaged") return "packaged";
  if (status === "shipped" || status === "sold") return "shipped";
  return "ordered";
}

export function nextOrderStatus(status: string): "packaged" | "shipped" | null {
  const stage = orderStage(status);
  if (stage === "ordered") return "packaged";
  if (stage === "packaged") return "shipped";
  return null;
}

export function displaySku(item: { id: string; sku?: string | null }): string {
  return item.sku || `P${item.id.slice(-4).toUpperCase()}`;
}
