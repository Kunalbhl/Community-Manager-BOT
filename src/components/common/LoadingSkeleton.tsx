import React from 'react';

interface LoadingSkeletonProps {
  count?: number;
  height?: string;
  type?: 'card' | 'table' | 'list' | 'metric' | 'drawer' | 'chart';
}

export const LoadingSkeleton: React.FC<LoadingSkeletonProps> = ({
  count = 3,
  type = 'list',
}) => {
  if (type === 'table') {
    return (
      <div className="w-full space-y-3 animate-pulse">
        <div className="h-10 bg-slate-200/70 rounded-lg w-full" />
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="h-12 bg-slate-100 rounded-lg w-full flex items-center px-4 justify-between">
            <div className="h-4 bg-slate-200/80 rounded w-1/4" />
            <div className="h-4 bg-slate-200/50 rounded w-1/6" />
            <div className="h-4 bg-slate-200/60 rounded w-1/5" />
            <div className="h-6 bg-slate-200/80 rounded-full w-16" />
          </div>
        ))}
      </div>
    );
  }

  if (type === 'metric') {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4 animate-pulse">
        {Array.from({ length: count || 4 }).map((_, i) => (
          <div key={i} className="h-24 bg-slate-100 rounded-xl border border-slate-200/60 p-4 space-y-2">
            <div className="h-3 bg-slate-200/70 rounded w-1/2" />
            <div className="h-7 bg-slate-200/90 rounded w-1/3" />
            <div className="h-2 bg-slate-200/50 rounded w-2/3" />
          </div>
        ))}
      </div>
    );
  }

  if (type === 'drawer') {
    return (
      <div className="space-y-6 animate-pulse p-4">
        <div className="h-16 bg-slate-200/60 rounded-xl w-full" />
        <div className="h-24 bg-slate-100 rounded-xl w-full border border-slate-200/60" />
        <div className="space-y-3">
          <div className="h-4 bg-slate-200/80 rounded w-1/3" />
          <div className="h-12 bg-slate-100 rounded-lg w-full" />
          <div className="h-12 bg-slate-100 rounded-lg w-full" />
        </div>
      </div>
    );
  }

  if (type === 'chart') {
    return (
      <div className="h-64 bg-slate-100 rounded-xl border border-slate-200/60 p-6 animate-pulse flex flex-col justify-between">
        <div className="h-4 bg-slate-200/80 rounded w-1/3" />
        <div className="flex items-end gap-3 h-40 pt-4">
          <div className="h-1/3 w-full bg-indigo-200/50 rounded-t" />
          <div className="h-2/3 w-full bg-indigo-200/70 rounded-t" />
          <div className="h-full w-full bg-indigo-300/80 rounded-t" />
          <div className="h-1/2 w-full bg-indigo-200/60 rounded-t" />
        </div>
      </div>
    );
  }

  if (type === 'card') {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-pulse">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="h-32 bg-slate-100 rounded-xl border border-slate-200/60 p-4 space-y-3">
            <div className="h-4 bg-slate-200/80 rounded w-1/2" />
            <div className="h-8 bg-slate-200/50 rounded w-3/4" />
            <div className="h-3 bg-slate-200/40 rounded w-1/3" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3 animate-pulse">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-16 bg-slate-100 border border-slate-200/60 rounded-xl p-4 flex items-center justify-between">
          <div className="space-y-2 w-2/3">
            <div className="h-4 bg-slate-200/80 rounded w-1/3" />
            <div className="h-3 bg-slate-200/50 rounded w-1/2" />
          </div>
          <div className="h-8 w-20 bg-slate-200/60 rounded-lg" />
        </div>
      ))}
    </div>
  );
};
