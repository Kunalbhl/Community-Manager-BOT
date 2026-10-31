import React from 'react';
import { EmptyState } from './EmptyState.js';
import { LoadingSkeleton } from './LoadingSkeleton.js';

export interface Column<T> {
  key: string;
  header: string;
  render?: (item: T) => React.ReactNode;
  width?: string;
  align?: 'left' | 'center' | 'right';
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T) => string;
  isLoading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  onRowClick?: (item: T) => void;
  className?: string;
}

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  isLoading = false,
  emptyTitle = 'No records found',
  emptyDescription = 'There are currently no items to display matching your criteria.',
  onRowClick,
  className = '',
}: DataTableProps<T>) {
  if (isLoading) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-6 space-y-3">
        <LoadingSkeleton count={5} />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-8">
        <EmptyState title={emptyTitle} description={emptyDescription} />
      </div>
    );
  }

  return (
    <div className={`overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#111827]/70 shadow-xs ${className}`}>
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`py-3 px-4 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 ${
                  col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                } ${col.width || ''} ${col.className || ''}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
          {data.map((item) => {
            const rowKey = keyExtractor(item);
            return (
              <tr
                key={rowKey}
                onClick={() => onRowClick && onRowClick(item)}
                className={`transition-colors duration-100 ${
                  onRowClick
                    ? 'cursor-pointer hover:bg-[#5865F2]/5 dark:hover:bg-[#5865F2]/10'
                    : 'hover:bg-slate-50/50 dark:hover:bg-slate-800/30'
                }`}
              >
                {columns.map((col) => {
                  const content = col.render
                    ? col.render(item)
                    : (item as any)[col.key] !== undefined
                    ? String((item as any)[col.key])
                    : '—';

                  return (
                    <td
                      key={`${rowKey}_${col.key}`}
                      className={`py-3 px-4 text-xs text-slate-700 dark:text-slate-300 ${
                        col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                      } ${col.className || ''}`}
                    >
                      {content}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
