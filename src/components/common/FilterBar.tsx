import React from 'react';
import { Search, Filter, X, Calendar, User, SlidersHorizontal, ArrowUpDown } from 'lucide-react';

export interface FilterOption {
  label: string;
  value: string;
}

export interface FilterGroup {
  id: string;
  label: string;
  options: FilterOption[];
  value: string;
  onChange: (value: string) => void;
  icon?: React.ElementType;
}

export interface FilterBarProps {
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  searchPlaceholder?: string;
  filterGroups?: FilterGroup[];
  sortBy?: string;
  onSortChange?: (sort: string) => void;
  sortOptions?: FilterOption[];
  onClearAll?: () => void;
  activeCount?: number;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  searchQuery = '',
  onSearchChange,
  searchPlaceholder = 'Search records...',
  filterGroups = [],
  sortBy,
  onSortChange,
  sortOptions = [],
  onClearAll,
  activeCount,
}) => {
  // Calculate total active filters if not explicitly provided
  const computedActiveCount =
    activeCount !== undefined
      ? activeCount
      : (searchQuery ? 1 : 0) +
        filterGroups.filter((g) => g.value && g.value !== 'ALL' && g.value !== '').length +
        (sortBy && sortBy !== 'DEFAULT' ? 1 : 0);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs sm:flex-row sm:items-center sm:justify-between">
      {/* Search Input */}
      {onSearchChange && (
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full rounded-lg border border-slate-300 bg-white py-1.5 pl-9 pr-8 text-xs font-medium text-slate-800 placeholder-slate-400 focus:border-indigo-500 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
              title="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Filter Groups & Sort Controls */}
      <div className="flex flex-wrap items-center gap-2">
        {filterGroups.map((group) => {
          const GroupIcon = group.icon || Filter;
          const isGroupActive = group.value && group.value !== 'ALL' && group.value !== '';
          return (
            <div key={group.id} className="relative flex items-center">
              <div
                className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
                  isGroupActive
                    ? 'border-indigo-300 bg-indigo-50/70 text-indigo-900'
                    : 'border-slate-300 bg-white text-slate-700'
                }`}
              >
                <GroupIcon className={`h-3.5 w-3.5 ${isGroupActive ? 'text-indigo-600' : 'text-slate-400'}`} />
                <select
                  value={group.value}
                  onChange={(e) => group.onChange(e.target.value)}
                  className="bg-transparent text-xs font-semibold focus:outline-hidden cursor-pointer"
                >
                  {group.options.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          );
        })}

        {/* Sort dropdown */}
        {sortOptions.length > 0 && onSortChange && (
          <div className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700">
            <ArrowUpDown className="h-3.5 w-3.5 text-slate-400" />
            <select
              value={sortBy || 'DEFAULT'}
              onChange={(e) => onSortChange(e.target.value)}
              className="bg-transparent text-xs font-semibold focus:outline-hidden cursor-pointer"
            >
              {sortOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Active Filter Counter & Clear All Button */}
        {computedActiveCount > 0 && onClearAll && (
          <button
            onClick={onClearAll}
            className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100 transition"
          >
            <X className="h-3.5 w-3.5" />
            <span>Clear ({computedActiveCount})</span>
          </button>
        )}
      </div>
    </div>
  );
};
