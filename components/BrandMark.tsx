import Link from "next/link";

function LogoMark({ size = 40 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo.png?v=2"
      alt=""
      width={size}
      height={size}
      className="shrink-0 object-contain"
      style={{ width: size, height: size }}
    />
  );
}

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark size={compact ? 32 : 40} />
      {!compact && (
        <span className="brand-word hidden text-[14px] font-semibold tracking-tight min-[1024px]:inline">
          Inventory Mommy
        </span>
      )}
    </span>
  );
}

export function BrandWord() {
  return (
    <Link href="/" className="inline-flex items-center gap-2 font-semibold tracking-tight">
      <LogoMark />
      Inventory Mommy
    </Link>
  );
}
