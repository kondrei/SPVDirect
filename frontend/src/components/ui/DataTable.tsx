import type { Key, ReactNode } from 'react';

export interface Column<R> {
  key: string;
  header: ReactNode;
  align?: 'num';
  mono?: boolean;
  render?: (row: R) => ReactNode;
}

export interface DataTableProps<R> {
  columns: Column<R>[];
  rows: R[];
  rowKey: (row: R) => Key;
  caption: string;
}

export function DataTable<R>({
  columns,
  rows,
  rowKey,
  caption,
}: DataTableProps<R>) {
  return (
    <div className="spv-table-wrap">
      <table className="spv-table">
        <caption className="spv-sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={c.align === 'num' ? 'spv-num' : undefined}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={rowKey(r)}>
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={
                    c.align === 'num'
                      ? 'spv-num'
                      : c.mono
                        ? 'spv-mono'
                        : undefined
                  }
                >
                  {c.render
                    ? c.render(r)
                    : String((r as Record<string, unknown>)[c.key] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
