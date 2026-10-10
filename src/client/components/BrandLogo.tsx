import { brand } from '@/shared/brand';

export function BrandLogo({ className }: { className?: string } = {}) {
  return (
    <span className={`flex items-center gap-2.5 ${className ?? ''}`}>
      <img
        src="/brand/logo-box.svg"
        alt=""
        width="32"
        height="32"
        className="size-8 shrink-0 rounded-lg"
      />
      <span className="text-lg font-bold tracking-tight">{brand.name}</span>
    </span>
  );
}
