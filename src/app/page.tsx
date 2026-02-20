"use client";

import { useState, useEffect, useCallback } from "react";
import { Header } from "@/components/Header";
import { Filters } from "@/components/Filters";
import { RestaurantCard } from "@/components/RestaurantCard";
import { RestaurantDetail } from "@/components/RestaurantDetail";
import { Map } from "@/components/Map";
import { Restaurant, RestaurantFilters, ItemMatchWithItems } from "@/lib/types";
import { getRestaurants, getItemMatchesForRestaurant, submitFlag } from "@/lib/data";
import { List, MapIcon, Loader2, ChevronLeft, ChevronRight, SlidersHorizontal } from "lucide-react";

type ViewMode = "split" | "list" | "map";

export default function Home() {
  const [filters, setFilters] = useState<RestaurantFilters>({});
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [selectedRestaurant, setSelectedRestaurant] = useState<Restaurant | null>(null);
  const [selectedItemMatches, setSelectedItemMatches] = useState<ItemMatchWithItems[]>([]);
  const [shouldFlyTo, setShouldFlyTo] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("split");
  const [loading, setLoading] = useState(true);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [filtersCollapsed, setFiltersCollapsed] = useState(false);

  // Fetch restaurants when filters change
  useEffect(() => {
    async function fetchRestaurants() {
      setLoading(true);
      const data = await getRestaurants(filters);
      setRestaurants(data);
      setLoading(false);
    }
    fetchRestaurants();
  }, [filters]);

  // Fetch item matches when a restaurant is selected
  useEffect(() => {
    async function fetchMatches() {
      if (!selectedRestaurant) {
        setSelectedItemMatches([]);
        return;
      }
      setLoadingMatches(true);
      const matches = await getItemMatchesForRestaurant(selectedRestaurant.id);
      setSelectedItemMatches(matches);
      setLoadingMatches(false);
    }
    fetchMatches();
  }, [selectedRestaurant]);

  // Handle restaurant selection from list (should fly to location)
  const handleSelectFromList = useCallback((restaurant: Restaurant) => {
    setSelectedRestaurant(restaurant);
    setShouldFlyTo(true);
  }, []);

  // Handle restaurant selection from map (should NOT fly)
  const handleSelectFromMap = useCallback((restaurant: Restaurant, fromMap: boolean) => {
    setSelectedRestaurant(restaurant);
    setShouldFlyTo(!fromMap);
  }, []);

  // Handle flagging
  const handleFlag = useCallback(async () => {
    if (!selectedRestaurant) return;
    
    const success = await submitFlag(selectedRestaurant.id, "outdated_prices");
    if (success) {
      alert("Thanks for letting us know! We'll review this soon.");
    } else {
      alert("Something went wrong. Please try again.");
    }
  }, [selectedRestaurant]);

  return (
    <div className="h-screen flex flex-col bg-[var(--background)] overflow-hidden">
      <Header />

      <main className="flex-1 flex flex-col min-h-0">
        {/* Mobile View Toggle */}
        <div className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-[var(--border)] bg-[var(--surface)]">
          <Filters
            filters={filters}
            onChange={setFilters}
            resultCount={restaurants.length}
          />
          <div className="flex items-center gap-1 bg-[var(--surface-hover)] rounded-lg p-1">
            <button
              onClick={() => setViewMode("list")}
              className={`p-2 rounded-md transition-colors ${
                viewMode === "list"
                  ? "bg-[var(--surface)] shadow-sm"
                  : "hover:bg-[var(--surface)]"
              }`}
              aria-label="List view"
            >
              <List size={18} />
            </button>
            <button
              onClick={() => setViewMode("map")}
              className={`p-2 rounded-md transition-colors ${
                viewMode === "map"
                  ? "bg-[var(--surface)] shadow-sm"
                  : "hover:bg-[var(--surface)]"
              }`}
              aria-label="Map view"
            >
              <MapIcon size={18} />
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* Sidebar - Filters (Desktop) */}
          <aside 
            className={`hidden lg:flex flex-col border-r border-[var(--border)] bg-[var(--surface)] overflow-hidden transition-all duration-300 ease-in-out ${
              filtersCollapsed ? "w-12" : "w-72"
            }`}
          >
            {/* Toggle Button */}
            <button
              onClick={() => setFiltersCollapsed(!filtersCollapsed)}
              className="flex items-center justify-center gap-2 p-3 border-b border-[var(--border)] hover:bg-[var(--surface-hover)] transition-colors"
              aria-label={filtersCollapsed ? "Expand filters" : "Collapse filters"}
            >
              {filtersCollapsed ? (
                <ChevronRight size={20} className="text-[var(--muted)]" />
              ) : (
                <>
                  <SlidersHorizontal size={16} className="text-[var(--muted)]" />
                  <span className="text-sm font-medium text-[var(--foreground)] flex-1 text-left">Filters</span>
                  <ChevronLeft size={20} className="text-[var(--muted)]" />
                </>
              )}
            </button>
            
            {/* Filter Content */}
            <div className={`flex-1 overflow-y-auto p-6 transition-opacity duration-200 ${
              filtersCollapsed ? "opacity-0 invisible" : "opacity-100 visible"
            }`}>
              <Filters
                filters={filters}
                onChange={setFilters}
                resultCount={restaurants.length}
              />
            </div>
          </aside>

          {/* Restaurant List */}
          <div
            className={`
              ${viewMode === "map" ? "hidden" : "flex"}
              lg:flex flex-col w-full lg:w-96 border-r border-[var(--border)] bg-[var(--background)]
              ${selectedRestaurant ? "hidden lg:flex" : ""}
              min-h-0
            `}
          >
            <div className="p-4 border-b border-[var(--border)] bg-[var(--surface)]">
              <p className="text-sm text-[var(--muted)]">
                {loading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin" />
                    Loading...
                  </span>
                ) : (
                  <>
                    <span className="font-semibold text-[var(--foreground)]">
                      {restaurants.length}
                    </span>{" "}
                    restaurants
                  </>
                )}
              </p>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 size={24} className="animate-spin text-[var(--muted)]" />
                </div>
              ) : restaurants.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-[var(--muted)]">
                    No restaurants found.
                  </p>
                  {Object.keys(filters).length > 0 && (
                    <button
                      onClick={() => setFilters({})}
                      className="mt-2 text-[var(--accent)] hover:underline text-sm"
                    >
                      Clear filters
                    </button>
                  )}
                  <p className="mt-4 text-sm text-[var(--muted)]">
                    Add restaurants via the{" "}
                    <a href="/admin" className="text-[var(--accent)] hover:underline">
                      admin panel
                    </a>
                    .
                  </p>
                </div>
              ) : (
                restaurants.map((restaurant, idx) => (
                  <div
                    key={restaurant.id}
                    className="animate-fade-in"
                    style={{ animationDelay: `${idx * 50}ms` }}
                  >
                    <RestaurantCard
                      restaurant={restaurant}
                      isSelected={selectedRestaurant?.id === restaurant.id}
                      onClick={() => handleSelectFromList(restaurant)}
                    />
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Detail Panel / Map */}
          <div
            className={`
              flex-1 flex min-h-0
              ${viewMode === "list" && !selectedRestaurant ? "hidden lg:flex" : ""}
            `}
          >
            {/* Restaurant Detail */}
            {selectedRestaurant && (
              <div className="w-full lg:w-[400px] border-r border-[var(--border)] overflow-y-auto">
                <RestaurantDetail
                  restaurant={selectedRestaurant}
                  itemMatches={selectedItemMatches}
                  onClose={() => setSelectedRestaurant(null)}
                  onFlag={handleFlag}
                />
              </div>
            )}

            {/* Map */}
            <div
              className={`
                flex-1 bg-[var(--surface-hover)]
                ${viewMode === "list" ? "hidden lg:block" : ""}
                ${selectedRestaurant && viewMode !== "map" ? "hidden lg:block" : ""}
              `}
            >
              <Map
                restaurants={restaurants}
                selectedRestaurant={selectedRestaurant}
                onSelectRestaurant={handleSelectFromMap}
                shouldFlyTo={shouldFlyTo}
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
