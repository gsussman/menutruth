"use client";

import { CuisineType, MarkupCategory, RestaurantFilters } from "@/lib/types";
import { Search, X, SlidersHorizontal } from "lucide-react";
import { useState } from "react";

interface FiltersProps {
  filters: RestaurantFilters;
  onChange: (filters: RestaurantFilters) => void;
  resultCount: number;
}

const cuisineOptions: { value: CuisineType; label: string; emoji: string }[] = [
  { value: "american", label: "American", emoji: "🍔" },
  { value: "asian", label: "Asian", emoji: "🥡" },
  { value: "chinese", label: "Chinese", emoji: "🥢" },
  { value: "indian", label: "Indian", emoji: "🍛" },
  { value: "italian", label: "Italian", emoji: "🍝" },
  { value: "japanese", label: "Japanese", emoji: "🍣" },
  { value: "korean", label: "Korean", emoji: "🍜" },
  { value: "mediterranean", label: "Mediterranean", emoji: "🥙" },
  { value: "mexican", label: "Mexican", emoji: "🌮" },
  { value: "pizza", label: "Pizza", emoji: "🍕" },
  { value: "thai", label: "Thai", emoji: "🍲" },
  { value: "vietnamese", label: "Vietnamese", emoji: "🍜" },
  { value: "deli", label: "Deli", emoji: "🥪" },
  { value: "seafood", label: "Seafood", emoji: "🦞" },
];

const markupOptions: { value: MarkupCategory; label: string; color: string }[] =
  [
    { value: "none", label: "No Markup", color: "bg-emerald-500" },
    { value: "low", label: "Low (1-10%)", color: "bg-lime-500" },
    { value: "medium", label: "Medium (11-20%)", color: "bg-amber-500" },
    { value: "high", label: "High (>20%)", color: "bg-red-500" },
  ];

export function Filters({ filters, onChange, resultCount }: FiltersProps) {
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  const updateFilter = (key: keyof RestaurantFilters, value: unknown) => {
    onChange({ ...filters, [key]: value });
  };

  const clearFilters = () => {
    onChange({});
  };

  const hasActiveFilters =
    filters.cuisine ||
    filters.markup_category ||
    filters.has_direct_delivery !== undefined ||
    filters.search_query;

  const filterContent = (
    <div className="space-y-6">
      {/* Search */}
      <div className="relative">
        <Search
          size={18}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]"
        />
        <input
          type="text"
          placeholder="Search restaurants..."
          value={filters.search_query || ""}
          onChange={(e) => updateFilter("search_query", e.target.value || undefined)}
          className="w-full pl-10 pr-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30 focus:border-[var(--accent)]"
        />
        {filters.search_query && (
          <button
            onClick={() => updateFilter("search_query", undefined)}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-[var(--surface-hover)]"
          >
            <X size={16} className="text-[var(--muted)]" />
          </button>
        )}
      </div>

      {/* Cuisine */}
      <div>
        <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
          Cuisine
        </label>
        <div className="flex flex-wrap gap-2">
          {cuisineOptions.map((cuisine) => (
            <button
              key={cuisine.value}
              onClick={() =>
                updateFilter(
                  "cuisine",
                  filters.cuisine === cuisine.value ? undefined : cuisine.value
                )
              }
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                filters.cuisine === cuisine.value
                  ? "bg-[var(--accent)] text-white"
                  : "bg-[var(--surface-hover)] text-[var(--foreground)] hover:bg-[var(--border)]"
              }`}
            >
              <span>{cuisine.emoji}</span>
              <span>{cuisine.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Markup Level */}
      <div>
        <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
          Markup Level
        </label>
        <div className="flex flex-wrap gap-2">
          {markupOptions.map((markup) => (
            <button
              key={markup.value}
              onClick={() =>
                updateFilter(
                  "markup_category",
                  filters.markup_category === markup.value
                    ? undefined
                    : markup.value
                )
              }
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                filters.markup_category === markup.value
                  ? "bg-[var(--accent)] text-white"
                  : "bg-[var(--surface-hover)] text-[var(--foreground)] hover:bg-[var(--border)]"
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${markup.color}`}></span>
              <span>{markup.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Direct Delivery Filter */}
      <div>
        <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
          Delivery Options
        </label>
        <div className="flex gap-2">
          <button
            onClick={() =>
              updateFilter(
                "has_direct_delivery",
                filters.has_direct_delivery === true ? undefined : true
              )
            }
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
              filters.has_direct_delivery === true
                ? "bg-emerald-600 text-white"
                : "bg-[var(--surface-hover)] text-[var(--foreground)] hover:bg-[var(--border)]"
            }`}
          >
            <span>🚚</span>
            <span>Direct Delivery</span>
          </button>
        </div>
      </div>

      {/* Clear Filters */}
      {hasActiveFilters && (
        <button
          onClick={clearFilters}
          className="w-full py-2 text-sm font-medium text-[var(--accent)] hover:underline"
        >
          Clear all filters
        </button>
      )}
    </div>
  );

  return (
    <>
      {/* Desktop Filters */}
      <div className="hidden lg:block">
        {filterContent}
        <div className="mt-4 pt-4 border-t border-[var(--border)]">
          <p className="text-sm text-[var(--muted)]">
            Showing <span className="font-semibold text-[var(--foreground)]">{resultCount}</span> restaurants
          </p>
        </div>
      </div>

      {/* Mobile Filter Button & Modal */}
      <div className="lg:hidden">
        <button
          onClick={() => setShowMobileFilters(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--surface)] border border-[var(--border)] text-sm font-medium"
        >
          <SlidersHorizontal size={16} />
          Filters
          {hasActiveFilters && (
            <span className="w-2 h-2 rounded-full bg-[var(--accent)]"></span>
          )}
        </button>

        {showMobileFilters && (
          <div className="fixed inset-0 z-50 bg-black/50" onClick={() => setShowMobileFilters(false)}>
            <div
              className="absolute bottom-0 left-0 right-0 max-h-[80vh] overflow-y-auto bg-[var(--surface)] rounded-t-3xl p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold">Filters</h3>
                <button
                  onClick={() => setShowMobileFilters(false)}
                  className="p-2 rounded-full hover:bg-[var(--surface-hover)]"
                >
                  <X size={20} />
                </button>
              </div>
              {filterContent}
              <button
                onClick={() => setShowMobileFilters(false)}
                className="w-full mt-6 py-3 rounded-xl bg-[var(--accent)] text-white font-medium"
              >
                Show {resultCount} restaurants
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
