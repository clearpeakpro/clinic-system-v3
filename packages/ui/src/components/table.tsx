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
}

export function DataTable<T>({
  caption,
  columns,
  rows,
  rowKey,
  empty = 'Sin filas',
}: {
  /** Nombre de la tabla para lectores de pantalla. */
  caption: string;
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  empty?: string;
}) {
  if (rows.length === 0) {
    return <p className="rounded-lg bg-surface-container-low p-space-lg text-center text-body-md text-on-surface-variant dark:bg-surface-container">{empty}</p>;
  }
  const primary = columns.find((c) => c.primary) ?? columns[0];
  const rest = columns.filter((c) => c !== primary);
  return (
    <>
      <div className="hidden overflow-x-auto rounded-lg bg-surface-container-lowest shadow-level-1 tab:block dark:bg-surface-container-low">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">{caption}</caption>
          <thead className="bg-surface-container-low dark:bg-surface-container">
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={cn('px-space-md py-space-md text-caption tracking-wider text-on-surface-variant uppercase', c.align === 'end' && 'text-right')}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={rowKey(row)} className="border-t border-surface-container hover:bg-surface dark:border-surface-container-high dark:hover:bg-surface-container">
                {columns.map((c) => (
                  <td key={c.key} className={cn('h-16 px-space-md py-space-sm text-body-md text-on-surface', c.align === 'end' && 'text-right')}>
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul aria-label={caption} className="flex flex-col gap-space-sm tab:hidden">
        {rows.map((row) => (
          <li key={rowKey(row)} className="flex flex-col gap-space-xs rounded-lg bg-surface-container-lowest p-space-md shadow-level-1 dark:bg-surface-container-low">
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
