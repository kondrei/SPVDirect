import { Fragment, type Key, type ReactNode } from 'react';

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
  stack?: boolean;
  rowNote?: (row: R) => ReactNode;
}

export function DataTable<R>({
  columns,
  rows,
  rowKey,
  caption,
  stack,
  rowNote,
}: DataTableProps<R>) {
  return (
    <div className="spv-table-wrap">
      <table className={stack ? 'spv-table spv-table-stack' : 'spv-table'}>
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
          {rows.map((r) => {
            const note = rowNote?.(r);
            return (
            <Fragment key={rowKey(r)}>
            <tr>
              {columns.map((c) => (
                <td
                  key={c.key}
                  data-label={typeof c.header === 'string' ? c.header : undefined}
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
            {note ? (
              <tr className="spv-row-note">
                <td colSpan={columns.length}>{note}</td>
              </tr>
            ) : null}
            </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
