import { Link } from '@tanstack/react-router';
import { SearchX } from 'lucide-react';
import { Button } from '@clinic/ui';
import { Brand } from '../components/brand.tsx';

/** S-GEN-29 Página no encontrada: fuera del marco, aunque haya sesión. «Atrás» lleva al inicio. */
export function NotFoundPage() {
  return (
    <div className="flex min-h-full flex-col bg-background">
      <header className="border-b border-outline-variant bg-surface-container-lowest px-margin py-space-sm">
        <Brand />
      </header>
      <main className="flex flex-1 flex-col items-center justify-center gap-space-md px-margin text-center">
        <SearchX aria-hidden className="size-12 text-on-surface-variant" />
        <h1 className="text-headline-lg text-on-surface">Página no encontrada</h1>
        <p className="text-body-lg text-on-surface-variant">La página solicitada no existe.</p>
        <Button asChild>
          <Link to="/">Atrás</Link>
        </Button>
      </main>
    </div>
  );
}
