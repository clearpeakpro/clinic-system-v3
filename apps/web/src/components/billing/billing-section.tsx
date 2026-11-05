import type { BillingStatement } from '@clinic/shared';
import { AsyncView } from '@clinic/ui';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';
import { api, type ApiError } from '../../lib/api.ts';
import { useMe } from '../../lib/session.ts';
import { CoverageRule, StatementTotalsView } from './statement-totals.tsx';

// S-CAJ-16 / S-CLI-23 Sección «Facturación» de la visita (T-027).
//  - Los cuatro roles clínicos ven los totales (nunca líneas aquí); el
//    servidor solo envía totales a Enfermería y al Proveedor, y audita la
//    lectura con su vista.
//  - «Ir a Caja» (el manual decía «Ir a checkout») solo para quien cobra
//    (checkout.access), en cualquier estado de la visita: se puede cobrar por
//    adelantado (ADR 0004).
//  - Se relee con `billing.changed` y `encounter.changed` de la visita.

export function BillingSection({ encounterId, sede }: { encounterId: string; sede: string }) {
  const me = useMe();
  const canCheckout = me.data?.permissions.includes('checkout.access') === true;
  const statement = useQuery<BillingStatement, ApiError>({
    queryKey: ['statement', encounterId],
    queryFn: () => api.statement(encounterId),
    staleTime: 0,
    gcTime: 0,
  });
  return (
    <AsyncView source={statement}>
      {(s) => (
        <div className="flex flex-col gap-space-md" data-testid="billing-section">
          <CoverageRule coverage={s.coverage} totals={s.totals} />
          <StatementTotalsView totals={s.totals} />
          {canCheckout ? (
            <Link
              to="/app/$sede/caja/$id"
              params={{ sede, id: encounterId }}
              className="flex min-h-touch items-center justify-center gap-space-xs self-end rounded-md bg-surface-container px-space-md text-body-lg-medium text-primary hover:bg-surface-container-high"
            >
              Ir a Caja <ArrowRight aria-hidden className="size-5" />
            </Link>
          ) : null}
        </div>
      )}
    </AsyncView>
  );
}
