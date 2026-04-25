import SortableHeader from './sortable-header';

export type SortState = { sort: string; dir: 'asc' | 'desc' };

type Column<T> = {
  header: string;
  cell: (row: T) => React.ReactNode;
  sortKey?: string;
};

type Props<T> = {
  columns: Column<T>[];
  rows: T[];
  sortState?: SortState;
  emptyMessage?: string;
};

export default function DataTable<T>({
  columns, rows, sortState, emptyMessage = 'No records yet.',
}: Props<T>) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-aegis-gray-200 bg-aegis-gray-50/40 p-12 text-center text-sm text-aegis-gray-500">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-aegis-gray-100 bg-white">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-aegis-gray-100 bg-aegis-gray-50/60">
            {columns.map((col, idx) => (
              <th
                key={`${col.header}-${idx}`}
                className="px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-aegis-gray-500"
              >
                {col.sortKey ? (
                  <SortableHeader
                    label={col.header}
                    sortKey={col.sortKey}
                    sortState={sortState}
                  />
                ) : (
                  col.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-aegis-gray-100">
          {rows.map((row, i) => (
            <tr key={i} className="transition-colors hover:bg-aegis-navy-50/40">
              {columns.map((col, idx) => (
                <td key={`${col.header}-${idx}`} className="px-5 py-4 text-aegis-gray">
                  {col.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
