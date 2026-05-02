'use client';

/**
 * Selectable list view. Same responsive shape as DataTable (table on sm+,
 * stacked cards on mobile) but with a checkbox column and a sticky action
 * toolbar that appears above the list whenever any rows are selected.
 *
 * Bulk actions accept the array of currently-selected row IDs. After they
 * resolve we clear the selection and let the caller deal with a refresh
 * (router.refresh, revalidatePath via the action, etc.).
 */

import { useMemo, useState, useTransition } from 'react';
import SortableHeader from './sortable-header';

export type SortState = { sort: string; dir: 'asc' | 'desc' };

type Column<T> = {
  header: string;
  cell: (row: T) => React.ReactNode;
  sortKey?: string;
};

export type BulkAction<T> = {
  label: string;
  // Variant tints the button. 'default' = navy, 'destructive' = red.
  variant?: 'default' | 'destructive';
  // Optional confirmation prompt before running.
  confirmMessage?: (rows: T[]) => string;
  // Returns null on success or an error string. Called with selected rows.
  run: (rows: T[]) => Promise<{ ok: boolean; error: string | null }>;
};

type Props<T> = {
  columns: Column<T>[];
  rows: T[];
  getId: (row: T) => string;
  bulkActions: BulkAction<T>[];
  sortState?: SortState;
  emptyMessage?: string;
};

export default function DataTableSelectable<T>({
  columns,
  rows,
  getId,
  bulkActions,
  sortState,
  emptyMessage = 'No records yet.',
}: Props<T>) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const selectedRows = useMemo(
    () => rows.filter((r) => selectedIds.has(getId(r))),
    [rows, selectedIds, getId],
  );

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selectedIds.size === rows.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(rows.map(getId)));
    }
  }

  function runBulk(action: BulkAction<T>) {
    if (selectedRows.length === 0) return;
    if (action.confirmMessage) {
      const msg = action.confirmMessage(selectedRows);
      if (!confirm(msg)) return;
    }
    startTransition(async () => {
      setError(null);
      const r = await action.run(selectedRows);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSelectedIds(new Set());
    });
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-aegis-gray-200 bg-aegis-gray-50/40 p-12 text-center text-sm text-aegis-gray-500">
        {emptyMessage}
      </div>
    );
  }

  const allSelected = selectedIds.size === rows.length;
  const anySelected = selectedIds.size > 0;

  return (
    <>
      {anySelected && (
        <div className="sticky top-0 z-10 mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-aegis-navy/30 bg-aegis-navy text-white px-4 py-2 shadow-sm">
          <span className="text-xs font-medium">
            {selectedIds.size} selected
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {bulkActions.map((action) => (
              <button
                key={action.label}
                type="button"
                onClick={() => runBulk(action)}
                disabled={pending}
                className={[
                  'inline-flex items-center justify-center rounded-md px-3 py-1 text-xs font-medium transition-colors disabled:opacity-60',
                  action.variant === 'destructive'
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'bg-white text-aegis-navy hover:bg-aegis-blue-50',
                ].join(' ')}
              >
                {action.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              disabled={pending}
              className="inline-flex items-center justify-center rounded-md px-2 py-1 text-xs font-medium text-white/80 hover:text-white"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-3 rounded-md border border-aegis-orange/30 bg-aegis-orange-50 px-3 py-2 text-xs text-aegis-orange-600">
          {error}
        </div>
      )}

      {/* Desktop / tablet table */}
      <div className="hidden overflow-x-auto rounded-lg border border-aegis-gray-100 bg-white sm:block">
        <table className="aegis-table w-full text-left text-sm">
          {/* Sticky header — same pattern as DataTable so NAME / INSTITUTION /
              etc. stay visible when scrolling a long list. */}
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-aegis-gray-100 bg-aegis-gray-50/95 backdrop-blur supports-[backdrop-filter]:bg-aegis-gray-50/80">
              <th className="w-10 px-3 py-3">
                <input
                  type="checkbox"
                  aria-label="Select all"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = anySelected && !allSelected;
                  }}
                  onChange={toggleAll}
                  className="h-3.5 w-3.5 cursor-pointer rounded border-aegis-gray-300 text-aegis-navy accent-aegis-navy"
                />
              </th>
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
            {rows.map((row) => {
              const id = getId(row);
              const isSelected = selectedIds.has(id);
              return (
                <tr
                  key={id}
                  className={[
                    'transition-colors',
                    isSelected
                      ? 'bg-aegis-navy-50/60'
                      : 'hover:bg-aegis-navy-50/40',
                  ].join(' ')}
                >
                  <td className="px-3 py-4">
                    <input
                      type="checkbox"
                      aria-label="Select row"
                      checked={isSelected}
                      onChange={() => toggleOne(id)}
                      className="h-3.5 w-3.5 cursor-pointer rounded border-aegis-gray-300 text-aegis-navy accent-aegis-navy"
                    />
                  </td>
                  {columns.map((col, idx) => (
                    <td key={`${col.header}-${idx}`} className="px-5 py-4 text-aegis-gray">
                      {col.cell(row)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <ul className="space-y-2 sm:hidden">
        {rows.map((row) => {
          const id = getId(row);
          const isSelected = selectedIds.has(id);
          return (
            <li
              key={id}
              className={[
                'rounded-lg border bg-white px-4 py-3 shadow-sm',
                isSelected
                  ? 'border-aegis-navy ring-1 ring-aegis-navy'
                  : 'border-aegis-gray-100',
              ].join(' ')}
            >
              <div className="mb-2 flex items-center justify-between">
                <label className="flex items-center gap-2 text-[11px] font-medium text-aegis-gray-500">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleOne(id)}
                    className="h-3.5 w-3.5 cursor-pointer rounded border-aegis-gray-300 text-aegis-navy accent-aegis-navy"
                  />
                  Select
                </label>
              </div>
              <dl className="space-y-2">
                {columns.map((col, idx) => {
                  const cell = col.cell(row);
                  if (!col.header) {
                    return (
                      <div
                        key={`${col.header}-${idx}`}
                        className="-mx-1 flex justify-end pt-1"
                      >
                        {cell}
                      </div>
                    );
                  }
                  return (
                    <div
                      key={`${col.header}-${idx}`}
                      className="flex items-start justify-between gap-3"
                    >
                      <dt className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.08em] text-aegis-gray-500">
                        {col.header}
                      </dt>
                      <dd className="min-w-0 flex-1 text-right text-sm text-aegis-gray">
                        {cell}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </li>
          );
        })}
      </ul>
    </>
  );
}
