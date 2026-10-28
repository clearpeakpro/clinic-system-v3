import { NAV, type NavItem } from '../lib/nav.ts';
import { useMe } from '../lib/session.ts';
import { NotFoundPage } from './not-found.tsx';

/**
 * Destinos del menú. En T-004 son páginas vacías con su título (el Panel
 * incluido); cada pantalla llega en su tarea. Un destino sin permiso no existe.
 */
export function DestinationPage({ section, segment }: { section: NavItem['section']; segment: string }) {
  const me = useMe();
  const item = NAV.find((i) => i.section === section && i.segment === segment);
  if (!item || (me.data && !me.data.permissions.includes(item.permission))) return <NotFoundPage />;
  return (
    <section aria-labelledby="page-title" className="flex flex-col gap-space-sm">
      <h1 id="page-title" className="text-headline-lg text-on-surface">
        {item.label}
      </h1>
    </section>
  );
}
