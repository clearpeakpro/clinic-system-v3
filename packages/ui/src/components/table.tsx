import type { ReactNode } from 'react';
import { cn } from '../cn.ts';

// Tabla (S-GEN-30 «ResponsiveTableOrCards»; aspecto del Panel S-REC-01 y de
// Caja S-CAJ-03): cabecera menta en mayúsculas, filas de 64 px. Desde 600 px
// es una tabla con desplazamiento horizontal; por debajo, tarjetas.

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  align?: 'start' | 'end';
  /** La columna que encabeza cada tarjeta en el teléfono. */
  primary?: boolean;
  /** Encabezado solo para lectores de pantalla (columna de acciones). */
  hideHeader?: boolean;
  /** Clases de la celda y su encabezado en la tabla (p. ej. ocultar la columna en anchos medios). */
  className?: string;
}

export function DataTable<T>({
  caption,
  columns,
  rows,
  rowKey,
  rowClassName,
  density = 'default',
  cardsBelow = 'tab',
  empty = 'Sin filas',
  onRowClick,
}: {
  /** Nombre de la tabla para lectores de pantalla. */
  caption: string;
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** Clases extra de la fila o tarjeta (p. ej. atenuar una fila deshabilitada). */
  rowClassName?: (row: T) => string | undefined;
  /** `compact`: menos relleno lateral, para tablas con muchas columnas (S-ADM-02). */
  density?: 'default' | 'compact';
  /** Hasta qué ancho se muestran tarjetas: `desk` para tablas anchas (la tableta vertical también ve tarjetas). */
  cardsBelow?: 'tab' | 'desk';
  empty?: string;
  /**
   * Toda la fila (o tarjeta) se toca con el ratón o el dedo. Para el teclado,
   * alguna celda debe llevar además un botón o enlace con la misma acción.
   */
  onRowClick?: (row: T) => void;
}) {
  if (rows.length === 0) {
    return <p className="rounded-lg bg-surface-container-low p-space-lg text-center text-body-md text-on-surface-variant dark:bg-surface-container">{empty}</p>;
  }
  const primary = columns.find((c) => c.primary) ?? columns[0];
  const rest = columns.filter((c) => c !== primary);
  return (
    <>
      <div
        className={cn(
          'hidden overflow-x-auto rounded-lg bg-surface-container-lowest shadow-level-1 dark:bg-surface-container-low',
          cardsBelow === 'desk' ? 'desk:block' : 'tab:block',
        )}
      >
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">{caption}</caption>
          <thead className="bg-surface-container-low dark:bg-surface-container">
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={cn(
                    'py-space-md text-caption tracking-wider text-on-surface-variant uppercase',
                    density === 'compact' ? 'px-space-sm first:pl-space-md last:pr-space-md' : 'px-space-md',
                    c.align === 'end' && 'text-right',
                    c.className,
                  )}
                >
                  {c.hideHeader ? <span className="sr-only">{c.header}</span> : c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                {...(onRowClick ? { onClick: () => { onRowClick(row); } } : {})}
                className={cn(
                  'border-t border-surface-container hover:bg-surface dark:border-surface-container-high dark:hover:bg-surface-container',
                  onRowClick && 'cursor-pointer',
                  rowClassName?.(row),
                )}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cn(
                      'h-16 py-space-sm text-body-md text-on-surface',
                      density === 'compact' ? 'px-space-sm first:pl-space-md last:pr-space-md' : 'px-space-md',
                      c.align === 'end' && 'text-right',
                      c.className,
                    )}
                  >
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul aria-label={caption} className={cn('flex flex-col gap-space-sm', cardsBelow === 'desk' ? 'desk:hidden' : 'tab:hidden')}>
        {rows.map((row) => (
          <li
            key={rowKey(row)}
            {...(onRowClick ? { onClick: () => { onRowClick(row); } } : {})}
            className={cn(
              'flex flex-col gap-space-xs rounded-lg bg-surface-container-lowest p-space-md shadow-level-1 dark:bg-surface-container-low',
              onRowClick && 'cursor-pointer',
              rowClassName?.(row),
            )}
          >
            {primary ? <div className="text-body-lg-medium text-on-surface">{primary.cell(row)}</div> : null}
            <dl className="grid grid-cols-[auto_1fr] items-center gap-x-space-md gap-y-space-xs">
              {rest.map((c) => (
                <div key={c.key} className="contents">
                  <dt className="text-caption text-on-surface-variant">{c.header}</dt>
                  <dd className={cn('text-body-md text-on-surface', c.align === 'end' && 'text-right')}>{c.cell(row)}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}
