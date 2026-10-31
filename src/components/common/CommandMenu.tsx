import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Search,
  FileText,
  User,
  Users,
  Megaphone,
  Radio,
  Cpu,
  Sparkles,
  ShieldCheck,
  Settings,
  ArrowRight,
  X,
  Command,
  Clock,
  Trash2,
  Calendar,
  AlertTriangle,
  Layers,
  Activity,
  CheckCircle2,
  Sliders,
  Shield,
  HelpCircle,
  ExternalLink,
  ChevronRight,
} from 'lucide-react';
import { CommunitySection, PlatformSection, PortalMode } from '../../types/ui.js';
import { UserRole } from '../../../shared/types/rbac.js';
import { SearchCategory, SearchResultItem, SearchResponse } from '../../../shared/types/search.js';

interface CommandMenuProps {
  isOpen: boolean;
  onClose: () => void;
  communityId: string;
  currentRole: UserRole;
  portalMode?: PortalMode;
  onNavigate: (section: CommunitySection) => void;
  onNavigatePlatform?: (section: PlatformSection) => void;
}

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  Navigation: Layers,
  Members: Users,
  Recruitment: FileText,
  Engagement: Megaphone,
  Moderation: ShieldCheck,
  'Events & Automation': Calendar,
  Integrations: Sliders,
  Settings: Settings,
  Platform: Shield,
  Commands: Command,
};

const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  Navigation: { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' },
  Members: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  Recruitment: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  Engagement: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  Moderation: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' },
  'Events & Automation': { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  Integrations: { bg: 'bg-cyan-50', text: 'text-cyan-700', border: 'border-cyan-200' },
  Settings: { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200' },
  Platform: { bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200' },
  Commands: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
};

const RECENT_SEARCHES_KEY = 'cr_universal_search_recents_v1';

export const CommandMenu: React.FC<CommandMenuProps> = ({
  isOpen,
  onClose,
  communityId,
  currentRole,
  portalMode,
  onNavigate,
  onNavigatePlatform,
}) => {
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('ALL');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [groupedResults, setGroupedResults] = useState<Record<string, SearchResultItem[]>>({});
  const [availableCategories, setAvailableCategories] = useState<SearchCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTimeMs, setSearchTimeMs] = useState<number | null>(null);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  const resultsContainerRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Load recent searches from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(RECENT_SEARCHES_KEY);
      if (stored) {
        setRecentSearches(JSON.parse(stored).slice(0, 5));
      }
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  const saveRecentSearch = useCallback((term: string) => {
    const trimmed = term.trim();
    if (!trimmed || trimmed.length < 2) return;
    setRecentSearches((prev) => {
      const updated = [trimmed, ...prev.filter((t) => t.toLowerCase() !== trimmed.toLowerCase())].slice(0, 5);
      try {
        localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
      } catch {}
      return updated;
    });
  }, []);

  const removeRecentSearch = (term: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setRecentSearches((prev) => {
      const updated = prev.filter((t) => t !== term);
      try {
        localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  const clearAllRecents = (e: React.MouseEvent) => {
    e.stopPropagation();
    setRecentSearches([]);
    try {
      localStorage.removeItem(RECENT_SEARCHES_KEY);
    } catch {}
  };

  // Perform search query with debounce and abort controller
  useEffect(() => {
    if (!isOpen) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);

    const isPlatformSearch = portalMode === 'PLATFORM_ADMIN' || currentRole === 'PLATFORM_OWNER';
    const endpoint = isPlatformSearch
      ? `/api/v1/platform/search?q=${encodeURIComponent(query)}&limit=35`
      : `/api/v1/search?q=${encodeURIComponent(query)}&communityId=${encodeURIComponent(communityId)}&limit=35`;

    const timer = setTimeout(() => {
      fetch(endpoint, {
        signal: controller.signal,
        headers: {
          'x-role': currentRole,
          'x-user-role': currentRole,
          'x-community-id': communityId,
        },
      })
        .then((res) => res.json())
        .then((data: SearchResponse) => {
          if (data && Array.isArray(data.results)) {
            setSearchResults(data.results);
            setGroupedResults((data.groupedResults as any) || {});
            setAvailableCategories(data.categories || []);
            setSearchTimeMs(data.searchTimeMs || null);
            setSelectedIndex(0);
          }
          setLoading(false);
        })
        .catch((err) => {
          if (err.name !== 'AbortError') {
            setLoading(false);
          }
        });
    }, 150);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, communityId, currentRole, portalMode, isOpen]);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setActiveCategory('ALL');
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Filter results by active category tab
  const displayedResults = useMemo(() => {
    if (activeCategory === 'ALL') {
      return searchResults;
    }
    return searchResults.filter((it) => it.category === activeCategory);
  }, [searchResults, activeCategory]);

  // Scroll selected item into view
  useEffect(() => {
    const activeEl = document.getElementById(`search-item-${selectedIndex}`);
    if (activeEl && resultsContainerRef.current) {
      activeEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [selectedIndex]);

  // Execute selected search item action / navigation
  const handleSelect = useCallback(
    async (item: SearchResultItem) => {
      if (query.trim()) {
        saveRecentSearch(query);
      }

      if (item.type === 'command') {
        try {
          await fetch('/api/v1/search/command', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-role': currentRole,
              'x-community-id': communityId,
            },
            body: JSON.stringify({
              commandId: item.resourceId,
              actionId: item.metadata?.actionId,
              communityId,
            }),
          });
        } catch {}
      }

      if (item.category === 'Platform' && onNavigatePlatform) {
        onNavigatePlatform(item.route as PlatformSection);
      } else {
        onNavigate(item.route as CommunitySection);
      }

      onClose();
    },
    [query, currentRole, communityId, onNavigate, onNavigatePlatform, onClose, saveRecentSearch]
  );

  // Handle keyboard shortcuts
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < displayedResults.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : displayedResults.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = displayedResults[selectedIndex];
      if (item) {
        handleSelect(item);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'Tab') {
      // Cycle through categories on Tab
      e.preventDefault();
      const allCats = ['ALL', ...availableCategories];
      const currentIdx = allCats.indexOf(activeCategory);
      const nextIdx = e.shiftKey
        ? currentIdx > 0
          ? currentIdx - 1
          : allCats.length - 1
        : currentIdx < allCats.length - 1
        ? currentIdx + 1
        : 0;
      setActiveCategory(allCats[nextIdx]);
      setSelectedIndex(0);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto p-3 sm:p-6 md:p-16">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-150"
        onClick={onClose}
      />

      <div className="relative mx-auto max-w-3xl transform overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xl transition-all">
        {/* Header Search Bar */}
        <div className="relative flex items-center border-b border-slate-200 px-4 py-3 bg-white">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
            {loading ? (
              <div className="h-4 w-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
          </div>

          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Type a command or search members, applications, events, settings... (Esc to close)"
            className="w-full bg-transparent px-3 text-sm font-medium text-slate-900 placeholder-slate-400 focus:outline-hidden"
            id="input-global-command-search"
          />

          {query && (
            <button
              onClick={() => {
                setQuery('');
                setSelectedIndex(0);
                inputRef.current?.focus();
              }}
              className="mr-2 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              title="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}

          <div className="flex items-center gap-1.5 shrink-0">
            <kbd className="hidden sm:inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[10px] font-mono text-slate-500 font-semibold border border-slate-200">
              ESC
            </kbd>
            <button
              onClick={onClose}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
              aria-label="Close search modal"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Category Filter Pills (if categories exist) */}
        {availableCategories.length > 1 && (
          <div className="flex items-center gap-1.5 overflow-x-auto border-b border-slate-100 bg-slate-50/70 px-4 py-2 text-xs scrollbar-none">
            <button
              onClick={() => {
                setActiveCategory('ALL');
                setSelectedIndex(0);
              }}
              className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                activeCategory === 'ALL'
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'bg-white text-slate-600 hover:bg-slate-200/70 border border-slate-200/80'
              }`}
            >
              All ({searchResults.length})
            </button>

            {availableCategories.map((cat) => {
              const count = groupedResults[cat]?.length || 0;
              const isSelected = activeCategory === cat;
              const Icon = CATEGORY_ICONS[cat] || Layers;
              return (
                <button
                  key={cat}
                  onClick={() => {
                    setActiveCategory(cat);
                    setSelectedIndex(0);
                  }}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-medium transition whitespace-nowrap ${
                    isSelected
                      ? 'bg-indigo-600 text-white shadow-2xs font-semibold'
                      : 'bg-white text-slate-600 hover:bg-slate-200/70 border border-slate-200/80'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 opacity-80" />
                  <span>{cat}</span>
                  <span
                    className={`text-[10px] rounded-full px-1.5 py-0.2 ${
                      isSelected ? 'bg-indigo-700 text-white' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Recent Searches Header (When query is empty & recents exist) */}
        {!query && recentSearches.length > 0 && (
          <div className="border-b border-slate-100 bg-slate-50/50 px-4 py-2 flex items-center justify-between text-xs text-slate-500">
            <div className="flex items-center gap-1.5 font-semibold text-slate-600">
              <Clock className="h-3.5 w-3.5 text-slate-400" />
              <span>Recent Searches</span>
            </div>
            <button
              onClick={clearAllRecents}
              className="text-[11px] text-slate-400 hover:text-slate-700 transition"
            >
              Clear all
            </button>
          </div>
        )}

        {!query && recentSearches.length > 0 && (
          <div className="flex flex-wrap gap-2 px-4 py-2 bg-slate-50/30 border-b border-slate-100">
            {recentSearches.map((term) => (
              <div
                key={term}
                onClick={() => {
                  setQuery(term);
                  inputRef.current?.focus();
                }}
                className="group flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/50 transition"
              >
                <span>{term}</span>
                <button
                  onClick={(e) => removeRecentSearch(term, e)}
                  className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Results Container */}
        <div ref={resultsContainerRef} className="max-h-[420px] overflow-y-auto p-2 scrollbar-thin">
          {displayedResults.length === 0 ? (
            <div className="py-12 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                <Search className="h-6 w-6" />
              </div>
              <p className="text-sm font-semibold text-slate-800">
                No matching resources or commands found
              </p>
              <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
                {query
                  ? `No items match "${query}" in this tenant scope. Try searching for member names, application IDs, event titles, or commands.`
                  : 'Start typing to search synchronized Discord members, recruitment pipelines, automations, or settings.'}
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {displayedResults.map((item, idx) => {
                const Icon = CATEGORY_ICONS[item.category] || Layers;
                const isSelected = idx === selectedIndex;
                const catColor = CATEGORY_COLORS[item.category] || {
                  bg: 'bg-slate-100',
                  text: 'text-slate-700',
                  border: 'border-slate-200',
                };

                return (
                  <button
                    id={`search-item-${idx}`}
                    key={item.id}
                    onClick={() => handleSelect(item)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`group flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-left transition ${
                      isSelected
                        ? 'bg-indigo-600 text-white shadow-xs font-medium'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-3.5 min-w-0 flex-1 pr-3">
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition ${
                          isSelected
                            ? 'bg-indigo-500 text-white shadow-2xs'
                            : `${catColor.bg} ${catColor.text}`
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-xs font-bold leading-tight truncate ${
                              isSelected ? 'text-white' : 'text-slate-900'
                            }`}
                          >
                            {item.title}
                          </span>
                          {item.status && (
                            <span
                              className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded ${
                                isSelected
                                  ? 'bg-indigo-700 text-white'
                                  : 'bg-slate-100 text-slate-600 border border-slate-200'
                              }`}
                            >
                              {item.status}
                            </span>
                          )}
                        </div>

                        {item.subtitle && (
                          <div
                            className={`text-[11px] mt-0.5 truncate ${
                              isSelected ? 'text-indigo-100' : 'text-slate-500'
                            }`}
                          >
                            {item.subtitle}
                          </div>
                        )}

                        {item.context && (
                          <div
                            className={`text-[10px] mt-0.5 truncate font-mono ${
                              isSelected ? 'text-indigo-200' : 'text-slate-400'
                            }`}
                          >
                            {item.context}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`text-[9px] uppercase font-bold px-2 py-0.5 rounded-md ${
                          isSelected
                            ? 'bg-indigo-700 text-white'
                            : `${catColor.bg} ${catColor.text} border ${catColor.border}`
                        }`}
                      >
                        {item.category}
                      </span>
                      <ChevronRight
                        className={`h-4 w-4 transition ${
                          isSelected ? 'text-white translate-x-0.5' : 'text-slate-300'
                        }`}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer info & keyboard shortcuts */}
        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50/90 px-4 py-2.5 text-[11px] text-slate-500">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="rounded bg-slate-200 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-600">
                ↑↓
              </kbd>{' '}
              navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded bg-slate-200 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-600">
                ↵
              </kbd>{' '}
              open
            </span>
            <span className="hidden sm:flex items-center gap-1">
              <kbd className="rounded bg-slate-200 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-600">
                Tab
              </kbd>{' '}
              category
            </span>
          </div>

          <div className="flex items-center gap-2 font-medium">
            {searchTimeMs !== null && (
              <span className="text-[10px] text-slate-400">{searchTimeMs}ms</span>
            )}
            <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700 border border-indigo-200">
              <ShieldCheck className="h-3 w-3" />
              Tenant & RBAC Protected
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
