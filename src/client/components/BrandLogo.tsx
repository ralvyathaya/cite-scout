import { brand } from '@/shared/brand';

export function BrandLogo() {
  return (
    <span className="flex items-center gap-2">
      <img
        src="/brand/logo-blue.svg"
        alt=""
        width="29"
        height="32"
        className="h-8 w-auto shrink-0"
      />
      <span className="text-lg font-bold tracking-tight">{brand.name}</span>
    </span>
  );
}
