"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Plus,
  Search,
  Edit2,
  Trash2,
  Upload,
  Download,
  RefreshCw,
  Check,
  X,
  ChevronDown,
  MapPin,
  Loader2,
  AlertCircle,
  LogOut,
  DollarSign,
  Link2,
} from "lucide-react";
import { createBrowserClient } from "@/lib/supabase-browser";
import { Restaurant, CuisineType, MarkupCategory } from "@/lib/types";
import { MarkupBadge } from "@/components/MarkupBadge";
import { supabase } from "@/lib/supabase";

interface RestaurantStats {
  ue_count: number;
  actual_count: number;
  match_count: number;
  ue_scraped_at: string | null;
  scrape_run_count: number;
}

type Tab = "restaurants" | "menu-items" | "matches" | "flags";

const cuisineOptions: CuisineType[] = [
  "american",
  "asian",
  "chinese",
  "indian",
  "italian",
  "japanese",
  "korean",
  "mediterranean",
  "mexican",
  "pizza",
  "thai",
  "vietnamese",
  "deli",
  "seafood",
  "other",
];

interface EditFormData {
  name: string;
  address: string;
  neighborhood: string;
  zip_code: string;
  cuisines: CuisineType[];
  latitude: number | null;
  longitude: number | null;
  phone_number: string;
  website_url: string;
  direct_ordering_url: string;
  has_direct_delivery: boolean;
  has_pickup: boolean;
  ubereats_url: string;
  markup_category: MarkupCategory;
  markup_percentage: number | null;
  notes: string;
  workflow_status: string;
}

interface GeocodedResult {
  latitude: number;
  longitude: number;
  formatted_address: string;
}

export default function AdminPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("restaurants");
  const [searchQuery, setSearchQuery] = useState("");
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [menuItemCount, setMenuItemCount] = useState(0);
  const [matchCount, setMatchCount] = useState(0);
  const [restaurantStats, setRestaurantStats] = useState<Record<string, RestaurantStats>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [loading, setLoading] = useState(true);

  const handleSignOut = async () => {
    const supabase = createBrowserClient();
    await supabase.auth.signOut();
    router.push("/admin/login");
    router.refresh();
  };

  // Edit modal state
  const [editForm, setEditForm] = useState<EditFormData>({
    name: "",
    address: "",
    neighborhood: "",
    zip_code: "",
    cuisines: [],
    latitude: null,
    longitude: null,
    phone_number: "",
    website_url: "",
    direct_ordering_url: "",
    has_direct_delivery: false,
    has_pickup: true,
    ubereats_url: "",
    markup_category: "none",
    markup_percentage: null,
    notes: "",
    workflow_status: "",
  });
  const [geocoding, setGeocoding] = useState(false);
  const [geocodedPreview, setGeocodedPreview] = useState<GeocodedResult | null>(null);
  const [geocodeError, setGeocodeError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Load data from Supabase
  useEffect(() => {
    async function fetchAllRestaurantIds(
      table: "menu_items" | "item_matches",
      source?: "ubereats" | "actual_menu"
    ): Promise<Array<{ restaurant_id: string; scraped_at?: string }>> {
      const pageSize = 1000;
      let countQuery = supabase
        .from(table)
        .select("restaurant_id", { count: "exact", head: true });
      if (source) countQuery = countQuery.eq("source", source);
      const { count } = await countQuery;
      const total = count || 0;
      if (total === 0) return [];

      const pages = Math.ceil(total / pageSize);
      const selectCols =
        source === "ubereats" ? "restaurant_id, scraped_at" : "restaurant_id";
      const pageResults = await Promise.all(
        Array.from({ length: pages }, (_, i) => {
          const from = i * pageSize;
          let q = supabase
            .from(table)
            .select(selectCols)
            .range(from, from + pageSize - 1);
          if (source) q = q.eq("source", source);
          return q;
        })
      );

      const rows: Array<{ restaurant_id: string; scraped_at?: string }> = [];
      for (const { data } of pageResults) {
        if (!data) continue;
        for (const row of data as unknown as Array<{
          restaurant_id: string;
          scraped_at?: string;
        }>) {
          rows.push(row);
        }
      }
      return rows;
    }

    async function loadData() {
      setLoading(true);
      
      // Load restaurants
      const { data: restaurantData } = await supabase
        .from("restaurants")
        .select("*")
        .order("name");
      
      if (restaurantData) {
        setRestaurants(restaurantData as Restaurant[]);
        
        const stats: Record<string, RestaurantStats> = {};
        for (const r of restaurantData) {
          stats[r.id] = { ue_count: 0, actual_count: 0, match_count: 0, ue_scraped_at: null, scrape_run_count: 0 };
        }

        const [ueItems, actualItems, matches, scrapeRuns] = await Promise.all([
          fetchAllRestaurantIds("menu_items", "ubereats"),
          fetchAllRestaurantIds("menu_items", "actual_menu"),
          fetchAllRestaurantIds("item_matches"),
          (async () => {
            const pageSize = 1000;
            const { count } = await supabase
              .from("scrape_runs")
              .select("restaurant_id", { count: "exact", head: true })
              .eq("source", "ubereats");
            const total = count || 0;
            if (total === 0) return [] as Array<{ restaurant_id: string }>;
            const pages = Math.ceil(total / pageSize);
            const pageResults = await Promise.all(
              Array.from({ length: pages }, (_, i) => {
                const from = i * pageSize;
                return supabase
                  .from("scrape_runs")
                  .select("restaurant_id")
                  .eq("source", "ubereats")
                  .range(from, from + pageSize - 1);
              })
            );
            const rows: Array<{ restaurant_id: string }> = [];
            for (const { data } of pageResults) {
              if (data) rows.push(...data);
            }
            return rows;
          })(),
        ]);

        for (const item of ueItems) {
          if (stats[item.restaurant_id]) {
            stats[item.restaurant_id].ue_count++;
            if (item.scraped_at) {
              const current = stats[item.restaurant_id].ue_scraped_at;
              if (!current || item.scraped_at > current) {
                stats[item.restaurant_id].ue_scraped_at = item.scraped_at;
              }
            }
          }
        }
        for (const item of actualItems) {
          if (stats[item.restaurant_id]) stats[item.restaurant_id].actual_count++;
        }
        for (const match of matches) {
          if (stats[match.restaurant_id]) stats[match.restaurant_id].match_count++;
        }
        for (const run of scrapeRuns) {
          if (stats[run.restaurant_id]) stats[run.restaurant_id].scrape_run_count++;
        }
        
        setRestaurantStats(stats);
      }

      // Get counts
      const { count: itemCount } = await supabase
        .from("menu_items")
        .select("*", { count: "exact", head: true });
      
      const { count: matchesCount } = await supabase
        .from("item_matches")
        .select("*", { count: "exact", head: true });

      setMenuItemCount(itemCount || 0);
      setMatchCount(matchesCount || 0);
      setLoading(false);
    }

    loadData();
  }, []);

  const filteredRestaurants = restaurants.filter(
    (r) =>
      r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.address.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this restaurant?")) {
      setRestaurants(restaurants.filter((r) => r.id !== id));
    }
  };

  const handleMarkVerified = (id: string) => {
    setRestaurants(
      restaurants.map((r) =>
        r.id === id ? { ...r, last_verified_at: new Date().toISOString() } : r
      )
    );
  };

  // Populate edit form when editingId changes
  useEffect(() => {
    if (editingId) {
      const restaurant = restaurants.find((r) => r.id === editingId);
      if (restaurant) {
        setEditForm({
          name: restaurant.name,
          address: restaurant.address,
          neighborhood: restaurant.neighborhood || "",
          zip_code: restaurant.zip_code || "",
          cuisines: restaurant.cuisines || [],
          latitude: restaurant.latitude,
          longitude: restaurant.longitude,
          phone_number: restaurant.phone_number || "",
          website_url: restaurant.website_url || "",
          direct_ordering_url: restaurant.direct_ordering_url || "",
          has_direct_delivery: restaurant.has_direct_delivery,
          has_pickup: restaurant.has_pickup,
          ubereats_url: restaurant.ubereats_url || "",
          markup_category: restaurant.markup_category,
          markup_percentage: restaurant.markup_percentage,
          notes: restaurant.notes || "",
          workflow_status: (restaurant as unknown as Record<string, unknown>).workflow_status as string || "",
        });
        setGeocodedPreview(null);
        setGeocodeError(null);
      }
    }
  }, [editingId, restaurants]);

  const handleCloseEdit = () => {
    setEditingId(null);
    setEditForm({
      name: "",
      address: "",
      neighborhood: "",
      zip_code: "",
      cuisines: [],
      latitude: null,
      longitude: null,
      phone_number: "",
      website_url: "",
      direct_ordering_url: "",
      has_direct_delivery: false,
      has_pickup: true,
      ubereats_url: "",
      markup_category: "none",
      markup_percentage: null,
      notes: "",
      workflow_status: "",
    });
    setGeocodedPreview(null);
    setGeocodeError(null);
  };

  const handleGeocode = async () => {
    if (!editForm.address.trim()) {
      setGeocodeError("Please enter an address");
      return;
    }

    setGeocoding(true);
    setGeocodeError(null);
    setGeocodedPreview(null);

    try {
      const response = await fetch("/api/geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: editForm.address }),
      });

      const data = await response.json();

      if (!response.ok) {
        setGeocodeError(data.error || "Geocoding failed");
        return;
      }

      setGeocodedPreview(data);
    } catch (error) {
      setGeocodeError("Failed to geocode address");
    } finally {
      setGeocoding(false);
    }
  };

  const handleApplyGeocode = () => {
    if (geocodedPreview) {
      setEditForm((prev) => ({
        ...prev,
        latitude: geocodedPreview.latitude,
        longitude: geocodedPreview.longitude,
      }));
      setGeocodedPreview(null);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;

    setSaving(true);

    try {
      const updateData: Record<string, unknown> = {
        name: editForm.name,
        address: editForm.address,
        neighborhood: editForm.neighborhood || null,
        zip_code: editForm.zip_code || null,
        cuisines: editForm.cuisines,
        latitude: editForm.latitude,
        longitude: editForm.longitude,
        phone_number: editForm.phone_number || null,
        website_url: editForm.website_url || null,
        direct_ordering_url: editForm.direct_ordering_url || null,
        has_direct_delivery: editForm.has_direct_delivery,
        has_pickup: editForm.has_pickup,
        ubereats_url: editForm.ubereats_url || null,
        markup_category: editForm.markup_category,
        markup_percentage: editForm.markup_percentage,
        notes: editForm.notes || null,
        updated_at: new Date().toISOString(),
      };

      // Only include workflow_status if it has a value
      if (editForm.workflow_status) {
        updateData.workflow_status = editForm.workflow_status;
      }

      const { error } = await supabase
        .from("restaurants")
        .update(updateData)
        .eq("id", editingId);

      if (error) {
        alert("Failed to save: " + error.message);
        return;
      }

      // Update local state
      setRestaurants((prev) =>
        prev.map((r) =>
          r.id === editingId
            ? {
                ...r,
                name: editForm.name,
                address: editForm.address,
                neighborhood: editForm.neighborhood || r.neighborhood,
                zip_code: editForm.zip_code || r.zip_code,
                cuisines: editForm.cuisines,
                latitude: editForm.latitude || r.latitude,
                longitude: editForm.longitude || r.longitude,
                phone_number: editForm.phone_number || r.phone_number,
                website_url: editForm.website_url || r.website_url,
                direct_ordering_url: editForm.direct_ordering_url || r.direct_ordering_url,
                has_direct_delivery: editForm.has_direct_delivery,
                has_pickup: editForm.has_pickup,
                ubereats_url: editForm.ubereats_url || r.ubereats_url,
                markup_category: editForm.markup_category,
                markup_percentage: editForm.markup_percentage,
                notes: editForm.notes || r.notes,
              }
            : r
        )
      );

      handleCloseEdit();
    } catch (error) {
      alert("Failed to save changes");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--background)]">
      {/* Header */}
      <header className="border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">⚙️</span>
              <div>
                <h1 className="text-xl font-bold">MenuTruth Admin</h1>
                <p className="text-sm text-[var(--muted)]">
                  Manage restaurants, menus, and data
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <a
                href="/admin/prices"
                className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-sm font-medium hover:opacity-90"
              >
                💰 Price Matching
              </a>
              <a
                href="/"
                className="text-sm text-[var(--accent)] hover:underline"
              >
                ← Back to site
              </a>
              <button
                onClick={handleSignOut}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--border)] hover:bg-[var(--surface-hover)] text-sm text-[var(--muted)]"
              >
                <LogOut size={16} />
                Sign out
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="max-w-7xl mx-auto px-6">
          <nav className="flex gap-6">
            {(
              [
                { id: "restaurants", label: "Restaurants", count: restaurants.length },
                { id: "menu-items", label: "Menu Items", count: menuItemCount },
                { id: "matches", label: "Item Matches", count: matchCount },
                { id: "flags", label: "Community Flags", count: 0 },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-4 px-1 border-b-2 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? "border-[var(--accent)] text-[var(--accent)]"
                    : "border-transparent text-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
              >
                {tab.label}
                <span className="ml-2 px-2 py-0.5 rounded-full bg-[var(--surface-hover)] text-xs">
                  {tab.count}
                </span>
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-6 py-6">
        {activeTab === "restaurants" && (
          <div className="space-y-6">
            {/* Actions Bar */}
            <div className="flex items-center justify-between gap-4">
              <div className="relative flex-1 max-w-md">
                <Search
                  size={18}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]"
                />
                <input
                  type="text"
                  placeholder="Search restaurants..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
                />
              </div>
              <div className="flex items-center gap-2">
                <button className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--border)] hover:bg-[var(--surface-hover)] text-sm">
                  <Upload size={16} />
                  Import
                </button>
                <button className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--border)] hover:bg-[var(--surface-hover)] text-sm">
                  <Download size={16} />
                  Export
                </button>
                <button
                  onClick={() => setShowAddForm(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--accent)] text-white hover:opacity-90 text-sm font-medium"
                >
                  <Plus size={16} />
                  Add Restaurant
                </button>
              </div>
            </div>

            {/* Restaurant Table */}
            <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--surface-hover)]">
                    <th className="px-4 py-3 text-left text-sm font-medium text-[var(--muted)]">
                      Restaurant
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-[var(--muted)]">
                      Items
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-[var(--muted)]">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-[var(--muted)]">
                      Markup
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-[var(--muted)]">
                      Dates
                    </th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-[var(--muted)]">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRestaurants.map((restaurant) => {
                    const stats = restaurantStats[restaurant.id] || { ue_count: 0, actual_count: 0, match_count: 0, ue_scraped_at: null, scrape_run_count: 0 };
                    const getStatus = () => {
                      if (stats.actual_count === 0) return { label: "Needs Actual Prices", color: "text-amber-600 bg-amber-50 dark:bg-amber-900/20" };
                      if (stats.match_count < stats.actual_count) return { label: "Needs Matches", color: "text-blue-600 bg-blue-50 dark:bg-blue-900/20" };
                      return { label: "Complete", color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20" };
                    };
                    const status = getStatus();
                    const formatDate = (iso: string | null | undefined) =>
                      iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—";
                    const ueScraped = stats.ue_scraped_at || restaurant.last_verified_at;
                    const pricesVerified = restaurant.actual_prices_verified_at;
                    const hasMenuUrl = Boolean(restaurant.actual_menu_url);
                    
                    return (
                      <tr
                        key={restaurant.id}
                        className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-hover)]/50"
                      >
                        <td className="px-4 py-3">
                          <div>
                            <div className="flex items-center gap-1.5">
                              <p className="font-medium text-[var(--foreground)]">
                                {restaurant.name}
                              </p>
                              {hasMenuUrl && (
                                <a
                                  href={restaurant.actual_menu_url!}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-emerald-600 hover:text-emerald-700"
                                  title={restaurant.actual_menu_url!}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Link2 size={14} />
                                </a>
                              )}
                            </div>
                            <p className="text-sm text-[var(--muted)]">
                              {restaurant.cuisines.slice(0, 2).join(", ")}
                            </p>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-[var(--muted)]">UE:</span>
                              <span className="font-medium">{stats.ue_count}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[var(--muted)]">Actual:</span>
                              <span className="font-medium">{stats.actual_count}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[var(--muted)]">Matches:</span>
                              <span className="font-medium">{stats.match_count}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${status.color}`}>
                            {status.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <MarkupBadge
                            category={restaurant.markup_category}
                            percentage={restaurant.markup_percentage}
                            size="sm"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-xs space-y-1 text-[var(--muted)]">
                            <div>
                              UE: {formatDate(ueScraped)}
                              {stats.scrape_run_count > 0 && (
                                <span className="ml-1 text-[var(--foreground)]">
                                  · {stats.scrape_run_count} scrape{stats.scrape_run_count === 1 ? "" : "s"}
                                </span>
                              )}
                            </div>
                            <div>Prices: {formatDate(pricesVerified)}</div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <Link
                              href={`/admin/prices?restaurant=${restaurant.id}`}
                              className="p-2 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                              title="Match Prices"
                            >
                              <DollarSign size={16} className="text-emerald-600" />
                            </Link>
                            <button
                              onClick={() => setEditingId(restaurant.id)}
                              className="p-2 rounded-lg hover:bg-[var(--surface-hover)]"
                              title="Edit"
                            >
                              <Edit2 size={16} className="text-[var(--muted)]" />
                            </button>
                            <button
                              onClick={() => handleDelete(restaurant.id)}
                              className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"
                              title="Delete"
                            >
                              <Trash2 size={16} className="text-red-500" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "menu-items" && (
          <div className="text-center py-12">
            <p className="text-[var(--muted)]">
              Menu items management coming soon.
            </p>
            <p className="text-sm text-[var(--muted)] mt-2">
              For now, use the scraper scripts to import menu data.
            </p>
          </div>
        )}

        {activeTab === "matches" && (
          <div className="text-center py-12">
            <p className="text-[var(--muted)]">
              Item matching interface coming soon.
            </p>
            <p className="text-sm text-[var(--muted)] mt-2">
              Run match_items.py to auto-match items with fuzzy matching.
            </p>
          </div>
        )}

        {activeTab === "flags" && (
          <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--surface-hover)]">
                  <th className="px-4 py-3 text-left text-sm font-medium text-[var(--muted)]">
                    Restaurant
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-[var(--muted)]">
                    Type
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-[var(--muted)]">
                    Description
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-[var(--muted)]">
                    Submitted
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-[var(--muted)]">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-[var(--border)]">
                  <td className="px-4 py-3 font-medium">Thai Market</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-1 rounded-full bg-amber-100 text-amber-700 text-xs">
                      Outdated Prices
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-[var(--muted)]">
                    Prices seem to have changed since January
                  </td>
                  <td className="px-4 py-3 text-sm text-[var(--muted)]">
                    2 days ago
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button className="text-sm text-[var(--accent)] hover:underline">
                      Resolve
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* Add Restaurant Modal */}
      {showAddForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowAddForm(false)}
        >
          <div
            className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-[var(--surface)] rounded-2xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 flex items-center justify-between px-6 py-4 border-b border-[var(--border)] bg-[var(--surface)]">
              <h2 className="text-lg font-semibold">Add Restaurant</h2>
              <button
                onClick={() => setShowAddForm(false)}
                className="p-2 rounded-full hover:bg-[var(--surface-hover)]"
              >
                <X size={20} />
              </button>
            </div>
            <form className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-1">Name *</label>
                  <input
                    type="text"
                    required
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
                    placeholder="Restaurant name"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-1">Address *</label>
                  <input
                    type="text"
                    required
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
                    placeholder="Full address"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Zip Code *</label>
                  <input
                    type="text"
                    required
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
                    placeholder="10024"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Phone</label>
                  <input
                    type="tel"
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
                    placeholder="(212) 555-1234"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Cuisines *</label>
                  <select
                    multiple
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
                  >
                    {cuisineOptions.map((c) => (
                      <option key={c} value={c} className="capitalize">
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Markup Category
                  </label>
                  <select className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30">
                    <option value="none">No Markup</option>
                    <option value="low">Low (1-10%)</option>
                    <option value="medium">Medium (11-20%)</option>
                    <option value="high">High (&gt;20%)</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-1">
                    UberEats URL
                  </label>
                  <input
                    type="url"
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
                    placeholder="https://www.ubereats.com/store/..."
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-1">
                    Direct Ordering URL
                  </label>
                  <input
                    type="url"
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
                    placeholder="https://restaurant.com/order"
                  />
                </div>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" className="rounded" />
                    <span className="text-sm">Has Direct Delivery</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" defaultChecked className="rounded" />
                    <span className="text-sm">Has Pickup</span>
                  </label>
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="px-4 py-2 rounded-lg border border-[var(--border)] hover:bg-[var(--surface-hover)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white font-medium hover:opacity-90"
                >
                  Add Restaurant
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Restaurant Modal */}
      {editingId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={handleCloseEdit}
        >
          <div
            className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-[var(--surface)] rounded-2xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 flex items-center justify-between px-6 py-4 border-b border-[var(--border)] bg-[var(--surface)]">
              <h2 className="text-lg font-semibold">Edit Restaurant</h2>
              <button
                onClick={handleCloseEdit}
                className="p-2 rounded-full hover:bg-[var(--surface-hover)]"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-5">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium mb-1">Name</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
                />
              </div>

              {/* Address */}
              <div>
                <label className="block text-sm font-medium mb-1">Address</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={editForm.address}
                    onChange={(e) =>
                      setEditForm((prev) => ({ ...prev, address: e.target.value }))
                    }
                    className="flex-1 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
                    placeholder="Full address"
                  />
                  <button
                    type="button"
                    onClick={handleGeocode}
                    disabled={geocoding}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                  >
                    {geocoding ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <MapPin size={16} />
                    )}
                    Geocode
                  </button>
                </div>
              </div>

              {/* Location */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Neighborhood</label>
                  <input
                    type="text"
                    value={editForm.neighborhood}
                    onChange={(e) =>
                      setEditForm((prev) => ({ ...prev, neighborhood: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
                    placeholder="Upper West Side"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Zip Code</label>
                  <input
                    type="text"
                    value={editForm.zip_code}
                    onChange={(e) =>
                      setEditForm((prev) => ({ ...prev, zip_code: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
                    placeholder="10024"
                  />
                </div>
              </div>

              {/* Geocode Error */}
              {geocodeError && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm">
                  <AlertCircle size={16} />
                  {geocodeError}
                </div>
              )}

              {/* Geocoded Preview */}
              {geocodedPreview && (
                <div className="p-4 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
                  <p className="text-sm font-medium text-emerald-800 dark:text-emerald-200 mb-2">
                    New coordinates found:
                  </p>
                  <p className="text-sm text-emerald-700 dark:text-emerald-300 mb-1">
                    {geocodedPreview.formatted_address}
                  </p>
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 mb-3">
                    Lat: {geocodedPreview.latitude.toFixed(6)}, Lng: {geocodedPreview.longitude.toFixed(6)}
                  </p>
                  <button
                    type="button"
                    onClick={handleApplyGeocode}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
                  >
                    <Check size={14} />
                    Apply Coordinates
                  </button>
                </div>
              )}

              {/* Coordinates */}
              <div>
                <label className="block text-sm font-medium mb-1 flex items-center gap-2">
                  <MapPin size={16} className="text-[var(--muted)]" />
                  Coordinates
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-[var(--muted)] mb-1">Latitude</label>
                    <input
                      type="number"
                      step="0.000001"
                      value={editForm.latitude ?? ""}
                      onChange={(e) =>
                        setEditForm((prev) => ({
                          ...prev,
                          latitude: e.target.value ? parseFloat(e.target.value) : null,
                        }))
                      }
                      className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30 font-mono text-sm"
                      placeholder="40.785000"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[var(--muted)] mb-1">Longitude</label>
                    <input
                      type="number"
                      step="0.000001"
                      value={editForm.longitude ?? ""}
                      onChange={(e) =>
                        setEditForm((prev) => ({
                          ...prev,
                          longitude: e.target.value ? parseFloat(e.target.value) : null,
                        }))
                      }
                      className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30 font-mono text-sm"
                      placeholder="-73.975000"
                    />
                  </div>
                </div>
                <p className="text-xs text-[var(--muted)] mt-1">
                  Enter manually or use Geocode button above to populate from address
                </p>
              </div>

              {/* Contact Info */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-[var(--muted)] border-b border-[var(--border)] pb-1">Contact Info</h3>
                <div>
                  <label className="block text-sm font-medium mb-1">Phone Number</label>
                  <input
                    type="tel"
                    value={editForm.phone_number}
                    onChange={(e) =>
                      setEditForm((prev) => ({ ...prev, phone_number: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
                    placeholder="(212) 555-1234"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Website URL</label>
                  <input
                    type="url"
                    value={editForm.website_url}
                    onChange={(e) =>
                      setEditForm((prev) => ({ ...prev, website_url: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
                    placeholder="https://restaurant.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Direct Ordering URL</label>
                  <input
                    type="url"
                    value={editForm.direct_ordering_url}
                    onChange={(e) =>
                      setEditForm((prev) => ({ ...prev, direct_ordering_url: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
                    placeholder="https://restaurant.com/order"
                  />
                </div>
              </div>

              {/* Ordering Options */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-[var(--muted)] border-b border-[var(--border)] pb-1">Ordering Options</h3>
                <div className="flex items-center gap-6">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editForm.has_direct_delivery}
                      onChange={(e) =>
                        setEditForm((prev) => ({ ...prev, has_direct_delivery: e.target.checked }))
                      }
                      className="rounded border-[var(--border)]"
                    />
                    <span className="text-sm">Has Direct Delivery</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editForm.has_pickup}
                      onChange={(e) =>
                        setEditForm((prev) => ({ ...prev, has_pickup: e.target.checked }))
                      }
                      className="rounded border-[var(--border)]"
                    />
                    <span className="text-sm">Has Pickup</span>
                  </label>
                </div>
              </div>

              {/* Platform Data */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-[var(--muted)] border-b border-[var(--border)] pb-1">Platform Data</h3>
                <div>
                  <label className="block text-sm font-medium mb-1">UberEats URL</label>
                  <input
                    type="url"
                    value={editForm.ubereats_url}
                    onChange={(e) =>
                      setEditForm((prev) => ({ ...prev, ubereats_url: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
                    placeholder="https://www.ubereats.com/store/..."
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">Markup Category</label>
                    <select
                      value={editForm.markup_category}
                      onChange={(e) =>
                        setEditForm((prev) => ({
                          ...prev,
                          markup_category: e.target.value as MarkupCategory,
                        }))
                      }
                      className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
                    >
                      <option value="none">None</option>
                      <option value="low">Low (1-10%)</option>
                      <option value="medium">Medium (11-20%)</option>
                      <option value="high">High (&gt;20%)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Markup %</label>
                    <input
                      type="number"
                      step="0.1"
                      value={editForm.markup_percentage ?? ""}
                      onChange={(e) =>
                        setEditForm((prev) => ({
                          ...prev,
                          markup_percentage: e.target.value ? parseFloat(e.target.value) : null,
                        }))
                      }
                      className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
                      placeholder="18"
                    />
                  </div>
                </div>
              </div>

              {/* Details */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-[var(--muted)] border-b border-[var(--border)] pb-1">Details</h3>
                <div>
                  <label className="block text-sm font-medium mb-1">Cuisines</label>
                  <div className="flex flex-wrap gap-2">
                    {cuisineOptions.map((cuisine) => (
                      <label
                        key={cuisine}
                        className={`px-3 py-1 rounded-full text-sm cursor-pointer transition-colors ${
                          editForm.cuisines.includes(cuisine)
                            ? "bg-[var(--accent)] text-white"
                            : "bg-[var(--surface-hover)] hover:bg-[var(--border)]"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={editForm.cuisines.includes(cuisine)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setEditForm((prev) => ({
                                ...prev,
                                cuisines: [...prev.cuisines, cuisine],
                              }));
                            } else {
                              setEditForm((prev) => ({
                                ...prev,
                                cuisines: prev.cuisines.filter((c) => c !== cuisine),
                              }));
                            }
                          }}
                          className="sr-only"
                        />
                        <span className="capitalize">{cuisine}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Notes</label>
                  <textarea
                    value={editForm.notes}
                    onChange={(e) =>
                      setEditForm((prev) => ({ ...prev, notes: e.target.value }))
                    }
                    rows={3}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30 resize-none"
                    placeholder="Internal notes about this restaurant..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Workflow Status</label>
                  <select
                    value={editForm.workflow_status}
                    onChange={(e) =>
                      setEditForm((prev) => ({ ...prev, workflow_status: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
                  >
                    <option value="">None</option>
                    <option value="ready">Ready</option>
                    <option value="needs_address">Needs Address</option>
                    <option value="needs_review">Needs Review</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-4 border-t border-[var(--border)]">
                <button
                  type="button"
                  onClick={handleCloseEdit}
                  className="px-4 py-2 rounded-lg border border-[var(--border)] hover:bg-[var(--surface-hover)]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--accent)] text-white font-medium hover:opacity-90 disabled:opacity-50"
                >
                  {saving && <Loader2 size={16} className="animate-spin" />}
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
