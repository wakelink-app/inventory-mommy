import { inventoryTab, orderStage, statusLabel } from "@/lib/format";

export function StatusBadge({
  status,
  draftStatus,
  onClick,
}: {
  status: string;
  draftStatus?: string | null;
  onClick?: () => void;
}) {
  const tab =
    status === "listed"
      ? "listed"
      : status === "returned"
        ? "returned"
        : status === "ordered" || status === "packaged" || status === "shipped" || status === "sold"
          ? orderStage(status)
          : inventoryTab(status, draftStatus);
  const label = statusLabel(tab);
  const className = `badge badge-${tab}${onClick ? " cursor-pointer border-0" : ""}`;
  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick}>
        {label}
      </button>
    );
  }
  return <span className={className}>{label}</span>;
}

export function OrderBadge({
  status,
  onClick,
}: {
  status: string;
  onClick?: () => void;
}) {
  return <StatusBadge status={orderStage(status)} onClick={onClick} />;
}
