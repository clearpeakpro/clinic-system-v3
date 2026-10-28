import { cn } from '../lib/cn.ts';

export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn('fill-current', className)}>
      <path d="M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7z" />
    </svg>
  );
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-space-sm">
      <span className="flex size-9 items-center justify-center rounded-md bg-primary-container text-on-primary">
        <BrandMark className="size-5" />
      </span>
      {compact ? null : <span className="text-headline-sm text-primary">Clinic System</span>}
    </div>
  );
}
