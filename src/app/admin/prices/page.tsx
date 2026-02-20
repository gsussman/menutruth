"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Plus,
  Link2,
  Unlink,
  Save,
  Trash2,
  RefreshCw,
  Check,
  AlertCircle,
  Globe,
  Download,
  Phone,
  ShoppingCart,
  ExternalLink,
  LogOut,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { createBrowserClient } from "@/lib/supabase-browser";

interface Restaurant {
  id: string;
  name: string;
  address: string;
  markup_category: string;
  markup_percentage: number | null;
  ordering_method?: string;
  direct_ordering_url?: string;
  website_url?: string;
  has_online_ordering?: boolean;
  has_phone_ordering?: boolean;
  is_delivery_app_only?: boolean;
}

interface RestaurantStats {
  ubereats_count: number;
  actual_count: number;
  match_count: number;
}

interface MenuItem {
  id: string;
  restaurant_id: string;
  source: "ubereats" | "actual_menu";
  item_name: string;
  item_description: string | null;
  price: number;
  category: string | null;
}

interface ItemMatch {
  id: string;
  restaurant_id: string;
  ubereats_item_id: string;
  actual_menu_item_id: string;
  price_difference: number;
  markup_percentage: number;
  is_manual_match: boolean;
}

export default function PriceMatchingPage() {
  const router = useRouter();
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [restaurantStats, setRestaurantStats] = useState<Record<string, RestaurantStats>>({});

  const handleSignOut = async () => {
    const supabase = createBrowserClient();
    await supabase.auth.signOut();
    router.push("/admin/login");
    router.refresh();
  };
  const [selectedRestaurant, setSelectedRestaurant] = useState<Restaurant | null>(null);
  const [ubereatsItems, setUbereatsItems] = useState<MenuItem[]>([]);
  const [actualItems, setActualItems] = useState<MenuItem[]>([]);
  const [matches, setMatches] = useState<ItemMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // New item form
  const [newItemName, setNewItemName] = useState("");
  const [newItemPrice, setNewItemPrice] = useState("");
  const [newItemCategory, setNewItemCategory] = useState("");

  // URL Import
  const [importUrl, setImportUrl] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const [importedItems, setImportedItems] = useState<Array<{ name: string; price: number; category: string }>>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const [hasOrderingSystem, setHasOrderingSystem] = useState(false);
  const [orderingMethod, setOrderingMethod] = useState<string>("unknown");

  // Matching state
  const [selectedUberEatsItem, setSelectedUberEatsItem] = useState<string | null>(null);
  const [selectedActualItem, setSelectedActualItem] = useState<string | null>(null);

  // Quick match state
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [quickMatchPrice, setQuickMatchPrice] = useState<string>("");

  // Ordering options state
  const [hasOnlineOrdering, setHasOnlineOrdering] = useState(false);
  const [hasPhoneOrdering, setHasPhoneOrdering] = useState(false);
  const [isDeliveryAppOnly, setIsDeliveryAppOnly] = useState(false);
  const [menuUrl, setMenuUrl] = useState("");
  const [showImportSection, setShowImportSection] = useState(false);

  // Filter state
  const [statusFilter, setStatusFilter] = useState<"all" | "needs_actual" | "needs_matches" | "complete">("all");

  // Import menu from URL (basic HTTP fetch + LLM)
  const handleImportFromUrl = async () => {
    if (!importUrl) return;

    setImportLoading(true);
    setImportError(null);
    setImportedItems([]);

    try {
      const response = await fetch("/api/scrape-menu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: importUrl }),
      });

      const data = await response.json();

      if (data.error) {
        if (data.needsManualScrape) {
          setImportError("Site blocked automated access. Try 'Browser Scrape' for JavaScript sites.");
        } else {
          setImportError(data.error);
        }
        return;
      }

      if (data.items && data.items.length > 0) {
        setImportedItems(data.items);
        setHasOrderingSystem(data.hasOrderingSystem || false);
        if (data.hasOrderingSystem) {
          setOrderingMethod("direct_online");
        }
      } else {
        setImportError("No menu items found. Try 'Browser Scrape' for JavaScript-heavy sites.");
      }
    } catch (error) {
      setImportError("Failed to fetch URL. Check that it's a valid menu page.");
    } finally {
      setImportLoading(false);
    }
  };

  // Browser-based scrape for JavaScript sites (uses Playwright)
  // Now passes restaurantId for deterministic matching against UberEats items
  const handleBrowserScrape = async () => {
    if (!importUrl || !selectedRestaurant) return;

    setImportLoading(true);
    setImportError(null);
    setImportedItems([]);

    try {
      const response = await fetch("/api/browser-scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          url: importUrl,
          restaurantId: selectedRestaurant.id  // Pass for deterministic matching
        }),
      });

      const data = await response.json();

      if (data.error) {
        setImportError(data.error);
        return;
      }

      if (data.items && data.items.length > 0) {
        setImportedItems(data.items);
        setHasOrderingSystem(data.hasOrderingSystem || false);
        if (data.hasOrderingSystem) {
          setOrderingMethod("direct_online");
        }
        // Show which method was used
        if (data.method) {
          console.log(`Extraction method: ${data.method}`);
        }
      } else {
        setImportError("No menu items found on this page.");
      }
    } catch (error) {
      setImportError("Browser scrape failed. Make sure the Python scraper is set up.");
    } finally {
      setImportLoading(false);
    }
  };

  // Add all imported items to actual menu
  const handleAddAllImported = async () => {
    if (!selectedRestaurant || importedItems.length === 0) return;

    setSaving(true);
    const itemsToInsert = importedItems.map((item) => ({
      restaurant_id: selectedRestaurant.id,
      source: "actual_menu" as const,
      item_name: item.name,
      price: Math.round(item.price * 100),
      category: item.category || null,
      scraped_at: new Date().toISOString(),
    }));

    const { data, error } = await supabase
      .from("menu_items")
      .insert(itemsToInsert)
      .select();

    if (data) {
      const newActualItems = [...actualItems, ...data];
      setActualItems(newActualItems);
      setImportedItems([]);
      setImportUrl("");

      // Update stats for actual item count
      updateRestaurantStats(selectedRestaurant.id, { actual_count: newActualItems.length });

      // Update restaurant with ordering info
      const updates: Record<string, unknown> = {};
      if (orderingMethod !== "unknown") {
        updates.ordering_method = orderingMethod;
      }
      if (orderingMethod === "direct_online" && importUrl) {
        updates.direct_ordering_url = importUrl;
      }

      if (Object.keys(updates).length > 0) {
        await supabase
          .from("restaurants")
          .update(updates)
          .eq("id", selectedRestaurant.id);
      }
    }

    if (error) {
      alert(`Error adding items: ${error.message}`);
    }

    setSaving(false);
  };

  // Load restaurants and their stats
  useEffect(() => {
    async function loadRestaurants() {
      const { data } = await supabase
        .from("restaurants")
        .select("id, name, address, markup_category, markup_percentage, ordering_method, direct_ordering_url, website_url, has_online_ordering, has_phone_ordering, is_delivery_app_only")
        .order("name");

      if (data) {
        setRestaurants(data);
        
        // Fetch stats for each restaurant
        const stats: Record<string, RestaurantStats> = {};
        
        for (const restaurant of data) {
          // Get UberEats item count
          const { count: ueCount } = await supabase
            .from("menu_items")
            .select("*", { count: "exact", head: true })
            .eq("restaurant_id", restaurant.id)
            .eq("source", "ubereats");
          
          // Get actual menu item count
          const { count: actualCount } = await supabase
            .from("menu_items")
            .select("*", { count: "exact", head: true })
            .eq("restaurant_id", restaurant.id)
            .eq("source", "actual_menu");
          
          // Get match count
          const { count: matchCount } = await supabase
            .from("item_matches")
            .select("*", { count: "exact", head: true })
            .eq("restaurant_id", restaurant.id);
          
          stats[restaurant.id] = {
            ubereats_count: ueCount || 0,
            actual_count: actualCount || 0,
            match_count: matchCount || 0,
          };
        }
        
        setRestaurantStats(stats);
      }
      setLoading(false);
    }
    loadRestaurants();
  }, []);

  // Load items when restaurant selected
  useEffect(() => {
    // Clear import state when switching restaurants
    setImportedItems([]);
    setImportUrl("");
    setImportError(null);
    setHasOrderingSystem(false);
    setExpandedItemId(null);
    setQuickMatchPrice("");
    setShowImportSection(false);
    
    if (!selectedRestaurant) {
      setUbereatsItems([]);
      setActualItems([]);
      setMatches([]);
      setHasOnlineOrdering(false);
      setHasPhoneOrdering(false);
      setIsDeliveryAppOnly(false);
      setMenuUrl("");
      return;
    }

    // Populate ordering options from restaurant data
    setHasOnlineOrdering(selectedRestaurant.has_online_ordering || false);
    setHasPhoneOrdering(selectedRestaurant.has_phone_ordering || false);
    setIsDeliveryAppOnly(selectedRestaurant.is_delivery_app_only || false);
    setMenuUrl(selectedRestaurant.website_url || selectedRestaurant.direct_ordering_url || "");

    async function loadItems() {
      setLoading(true);

      // Load UberEats items
      const { data: ueItems } = await supabase
        .from("menu_items")
        .select("*")
        .eq("restaurant_id", selectedRestaurant.id)
        .eq("source", "ubereats")
        .order("category", { ascending: true })
        .order("item_name", { ascending: true });

      // Load actual menu items
      const { data: actualMenuItems } = await supabase
        .from("menu_items")
        .select("*")
        .eq("restaurant_id", selectedRestaurant.id)
        .eq("source", "actual_menu")
        .order("item_name", { ascending: true });

      // Load existing matches
      const { data: existingMatches } = await supabase
        .from("item_matches")
        .select("*")
        .eq("restaurant_id", selectedRestaurant.id);

      setUbereatsItems(ueItems || []);
      setActualItems(actualMenuItems || []);
      setMatches(existingMatches || []);
      setLoading(false);
    }

    loadItems();
  }, [selectedRestaurant]);

  // Add new actual menu item
  const handleAddActualItem = async () => {
    if (!selectedRestaurant || !newItemName || !newItemPrice) {
      console.log("Missing required fields:", { selectedRestaurant: !!selectedRestaurant, newItemName, newItemPrice });
      return;
    }

    setSaving(true);
    const priceInCents = Math.round(parseFloat(newItemPrice) * 100);

    console.log("Adding item:", { restaurant_id: selectedRestaurant.id, item_name: newItemName, price: priceInCents });

    const { data, error } = await supabase
      .from("menu_items")
      .insert({
        restaurant_id: selectedRestaurant.id,
        source: "actual_menu",
        item_name: newItemName,
        price: priceInCents,
        category: newItemCategory || null,
        scraped_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error("Error adding item:", error);
      alert(`Error adding item: ${error.message}`);
    } else if (data && selectedRestaurant) {
      console.log("Item added:", data);
      const newActualItems = [...actualItems, data];
      setActualItems(newActualItems);
      setNewItemName("");
      setNewItemPrice("");
      setNewItemCategory("");
      // Update stats
      updateRestaurantStats(selectedRestaurant.id, { actual_count: newActualItems.length });
    }
    setSaving(false);
  };

  // Create a match between items
  const handleCreateMatch = async () => {
    if (!selectedRestaurant || !selectedUberEatsItem || !selectedActualItem) return;

    const ueItem = ubereatsItems.find((i) => i.id === selectedUberEatsItem);
    const actualItem = actualItems.find((i) => i.id === selectedActualItem);

    if (!ueItem || !actualItem) return;

    setSaving(true);

    const priceDiff = ueItem.price - actualItem.price;
    const markupPct = ((priceDiff / actualItem.price) * 100).toFixed(2);

    const { data, error } = await supabase
      .from("item_matches")
      .insert({
        restaurant_id: selectedRestaurant.id,
        ubereats_item_id: selectedUberEatsItem,
        actual_menu_item_id: selectedActualItem,
        price_difference: priceDiff,
        markup_percentage: parseFloat(markupPct),
        is_manual_match: true,
        match_confidence: 100,
      })
      .select()
      .single();

    if (data) {
      setMatches([...matches, data]);
      setSelectedUberEatsItem(null);
      setSelectedActualItem(null);

      // Update restaurant markup
      await updateRestaurantMarkup();
    }
    setSaving(false);
  };

  // Delete a match
  const handleDeleteMatch = async (matchId: string) => {
    setSaving(true);
    await supabase.from("item_matches").delete().eq("id", matchId);
    setMatches(matches.filter((m) => m.id !== matchId));
    await updateRestaurantMarkup();
    setSaving(false);
  };

  // Delete actual item
  const handleDeleteActualItem = async (itemId: string) => {
    if (!selectedRestaurant) return;
    setSaving(true);
    // First delete any matches
    await supabase.from("item_matches").delete().eq("actual_menu_item_id", itemId);
    // Then delete the item
    await supabase.from("menu_items").delete().eq("id", itemId);
    const newActualItems = actualItems.filter((i) => i.id !== itemId);
    setActualItems(newActualItems);
    setMatches(matches.filter((m) => m.actual_menu_item_id !== itemId));
    // Update stats
    updateRestaurantStats(selectedRestaurant.id, { actual_count: newActualItems.length });
    await updateRestaurantMarkup();
    setSaving(false);
  };

  // Quick match: create actual_menu item and match in one action
  const handleQuickMatch = async (ubereatsItemId: string) => {
    if (!selectedRestaurant || !quickMatchPrice) return;

    const ueItem = ubereatsItems.find((i) => i.id === ubereatsItemId);
    if (!ueItem) return;

    const actualPriceInCents = Math.round(parseFloat(quickMatchPrice) * 100);
    if (isNaN(actualPriceInCents) || actualPriceInCents <= 0) {
      alert("Please enter a valid price");
      return;
    }

    setSaving(true);

    // First, create the actual menu item
    const { data: newActualItem, error: itemError } = await supabase
      .from("menu_items")
      .insert({
        restaurant_id: selectedRestaurant.id,
        source: "actual_menu",
        item_name: ueItem.item_name,
        price: actualPriceInCents,
        category: ueItem.category,
        scraped_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (itemError || !newActualItem) {
      console.error("Error creating actual item:", itemError);
      alert("Failed to create menu item");
      setSaving(false);
      return;
    }

    // Add to local state
    const newActualItems = [...actualItems, newActualItem];
    setActualItems(newActualItems);

    // Calculate markup
    const priceDiff = ueItem.price - actualPriceInCents;
    const markupPct = ((priceDiff / actualPriceInCents) * 100).toFixed(2);

    // Create the match
    const { data: matchData, error: matchError } = await supabase
      .from("item_matches")
      .insert({
        restaurant_id: selectedRestaurant.id,
        ubereats_item_id: ubereatsItemId,
        actual_menu_item_id: newActualItem.id,
        price_difference: priceDiff,
        markup_percentage: parseFloat(markupPct),
        is_manual_match: true,
        match_confidence: 100,
      })
      .select()
      .single();

    if (matchError || !matchData) {
      console.error("Error creating match:", matchError);
      alert("Item created but match failed");
      setSaving(false);
      return;
    }

    // Update local state
    setMatches([...matches, matchData]);
    
    // Update stats
    updateRestaurantStats(selectedRestaurant.id, { 
      actual_count: newActualItems.length,
      match_count: matches.length + 1 
    });

    // Update restaurant markup
    await updateRestaurantMarkup();

    // Reset quick match state
    setExpandedItemId(null);
    setQuickMatchPrice("");
    setSaving(false);
  };

  // Save ordering options
  const handleSaveOrderingOptions = async () => {
    if (!selectedRestaurant) return;
    
    setSaving(true);
    const { error } = await supabase
      .from("restaurants")
      .update({
        has_online_ordering: hasOnlineOrdering,
        has_phone_ordering: hasPhoneOrdering,
        is_delivery_app_only: isDeliveryAppOnly,
        website_url: menuUrl || null,
      })
      .eq("id", selectedRestaurant.id);

    if (error) {
      console.error("Error saving ordering options:", error);
      alert("Failed to save ordering options");
    }
    
    // Update local state
    setSelectedRestaurant({
      ...selectedRestaurant,
      has_online_ordering: hasOnlineOrdering,
      has_phone_ordering: hasPhoneOrdering,
      is_delivery_app_only: isDeliveryAppOnly,
      website_url: menuUrl || undefined,
    });
    
    setSaving(false);
  };

  // Update stats for a specific restaurant
  const updateRestaurantStats = (restaurantId: string, updates: Partial<RestaurantStats>) => {
    setRestaurantStats((prev) => ({
      ...prev,
      [restaurantId]: {
        ...prev[restaurantId],
        ...updates,
      },
    }));
  };

  // Update restaurant's overall markup
  const updateRestaurantMarkup = async () => {
    if (!selectedRestaurant) return;

    // Recalculate from current matches
    const { data: currentMatches } = await supabase
      .from("item_matches")
      .select("markup_percentage")
      .eq("restaurant_id", selectedRestaurant.id);

    let category = "none";
    let avgMarkup: number | null = null;
    const matchCount = currentMatches?.length || 0;

    if (currentMatches && currentMatches.length > 0) {
      avgMarkup = currentMatches.reduce((sum, m) => sum + m.markup_percentage, 0) / currentMatches.length;

      if (avgMarkup > 20) category = "high";
      else if (avgMarkup > 10) category = "medium";
      else if (avgMarkup > 0) category = "low";
    }

    await supabase
      .from("restaurants")
      .update({ markup_category: category, markup_percentage: avgMarkup })
      .eq("id", selectedRestaurant.id);

    // Update selectedRestaurant state
    setSelectedRestaurant({ ...selectedRestaurant, markup_category: category, markup_percentage: avgMarkup });

    // Also update the restaurants list so going "back" shows the new value
    setRestaurants((prev) =>
      prev.map((r) =>
        r.id === selectedRestaurant.id
          ? { ...r, markup_category: category, markup_percentage: avgMarkup }
          : r
      )
    );

    // Update stats to reflect current match count
    updateRestaurantStats(selectedRestaurant.id, { match_count: matchCount });
  };

  // Get match for an item
  const getMatchForUberEatsItem = (itemId: string) => {
    return matches.find((m) => m.ubereats_item_id === itemId);
  };

  const getMatchForActualItem = (itemId: string) => {
    return matches.find((m) => m.actual_menu_item_id === itemId);
  };

  // Format price
  const formatPrice = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  // Get markup color
  const getMarkupColor = (pct: number) => {
    if (pct <= 0) return "text-emerald-600";
    if (pct <= 10) return "text-blue-600";
    if (pct <= 20) return "text-amber-600";
    return "text-red-600";
  };

  // Sync all restaurant markups
  const handleSyncAllMarkups = async () => {
    if (!confirm("This will recalculate markup for all restaurants based on their matches. Continue?")) {
      return;
    }
    
    setSaving(true);
    try {
      const response = await fetch("/api/sync-markups", { method: "POST" });
      const data = await response.json();
      
      if (data.error) {
        alert(`Error: ${data.error}`);
      } else {
        alert(`Synced ${data.results.length} restaurants`);
        // Reload the page to refresh data
        window.location.reload();
      }
    } catch (error) {
      alert("Sync failed");
    }
    setSaving(false);
  };

  if (!selectedRestaurant) {
    return (
      <div className="min-h-screen bg-[var(--background)]">
        <header className="border-b border-[var(--border)] bg-[var(--surface)]">
          <div className="max-w-7xl mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-2xl">💰</span>
                <div>
                  <h1 className="text-xl font-bold">Price Matching</h1>
                  <p className="text-sm text-[var(--muted)]">
                    Compare UberEats prices with actual menu prices
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <button
                  onClick={handleSyncAllMarkups}
                  disabled={saving}
                  className="text-sm px-3 py-1.5 rounded-lg border border-[var(--border)] hover:bg-[var(--surface-hover)] disabled:opacity-50"
                >
                  <RefreshCw size={14} className={`inline mr-1 ${saving ? 'animate-spin' : ''}`} />
                  Sync Markups
                </button>
                <a href="/admin" className="text-sm text-[var(--accent)] hover:underline">
                  ← Back to Admin
                </a>
                <button
                  onClick={handleSignOut}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--border)] hover:bg-[var(--surface-hover)] text-sm text-[var(--muted)]"
                >
                  <LogOut size={14} />
                  Sign out
                </button>
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-4xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Select a Restaurant</h2>
            
            {/* Status Filters */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-[var(--muted)] mr-2">Filter:</span>
              <button
                onClick={() => setStatusFilter("all")}
                className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${
                  statusFilter === "all"
                    ? "bg-gray-800 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                All
              </button>
              <button
                onClick={() => setStatusFilter("needs_actual")}
                className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${
                  statusFilter === "needs_actual"
                    ? "bg-red-600 text-white"
                    : "bg-red-100 text-red-700 hover:bg-red-200"
                }`}
              >
                Needs Actual Prices
              </button>
              <button
                onClick={() => setStatusFilter("needs_matches")}
                className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${
                  statusFilter === "needs_matches"
                    ? "bg-amber-600 text-white"
                    : "bg-amber-100 text-amber-700 hover:bg-amber-200"
                }`}
              >
                Needs Matching
              </button>
              <button
                onClick={() => setStatusFilter("complete")}
                className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${
                  statusFilter === "complete"
                    ? "bg-emerald-600 text-white"
                    : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                }`}
              >
                Complete
              </button>
            </div>
          </div>
          
          {loading ? (
            <div className="text-center py-12 text-[var(--muted)]">Loading...</div>
          ) : (
            <div className="grid gap-3">
              {restaurants
                .filter((r) => {
                  if (statusFilter === "all") return true;
                  
                  const stats = restaurantStats[r.id];
                  const hasUbereats = stats?.ubereats_count > 0;
                  const hasActual = stats?.actual_count > 0;
                  const hasMatches = stats?.match_count > 0;
                  
                  if (statusFilter === "complete") return hasMatches;
                  if (statusFilter === "needs_matches") return hasActual && hasUbereats && !hasMatches;
                  if (statusFilter === "needs_actual") return hasUbereats && !hasActual;
                  
                  return true;
                })
                .map((r) => {
                const stats = restaurantStats[r.id];
                const hasUbereats = stats?.ubereats_count > 0;
                const hasActual = stats?.actual_count > 0;
                const hasMatches = stats?.match_count > 0;
                
                // Determine status
                let status: "complete" | "needs_actual" | "needs_matches" | "no_data" = "no_data";
                if (hasMatches) {
                  status = "complete";
                } else if (hasActual && hasUbereats) {
                  status = "needs_matches";
                } else if (hasUbereats && !hasActual) {
                  status = "needs_actual";
                }
                
                return (
                  <button
                    key={r.id}
                    onClick={() => {
                      setSelectedRestaurant(r);
                      setOrderingMethod(r.ordering_method || "unknown");
                    }}
                    className="flex items-center justify-between p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-hover)] text-left transition-colors"
                  >
                    <div className="flex-1">
                      <p className="font-medium">{r.name}</p>
                      <p className="text-sm text-[var(--muted)]">{r.address}</p>
                      
                      {/* Status pills */}
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        {stats && (
                          <>
                            {status === "complete" && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                                <Check size={12} /> {stats.match_count} matches
                              </span>
                            )}
                            {status === "needs_matches" && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                                <AlertCircle size={12} /> Needs matching
                              </span>
                            )}
                            {status === "needs_actual" && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                                <AlertCircle size={12} /> Needs actual prices
                              </span>
                            )}
                            
                            {/* Item counts */}
                            <span className="text-xs text-[var(--muted)]">
                              {stats.ubereats_count} UE · {stats.actual_count} actual
                            </span>
                          </>
                        )}
                        
                        {r.ordering_method && r.ordering_method !== "unknown" && (
                          <span className={`inline-flex items-center gap-1 text-xs ${
                            r.ordering_method === "direct_online" ? "text-emerald-600" :
                            r.ordering_method === "menu_phone" ? "text-amber-600" :
                            "text-red-600"
                          }`}>
                            {r.ordering_method === "direct_online" && <><ShoppingCart size={12} /> Online</>}
                            {r.ordering_method === "menu_phone" && <><Phone size={12} /> Phone</>}
                            {r.ordering_method === "delivery_app_only" && <><ExternalLink size={12} /> App Only</>}
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <div className="text-right ml-4">
                      <span
                        className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${
                          r.markup_category === "none"
                            ? "bg-emerald-100 text-emerald-700"
                            : r.markup_category === "low"
                            ? "bg-blue-100 text-blue-700"
                            : r.markup_category === "medium"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {r.markup_category === "none"
                          ? "No markup"
                          : r.markup_percentage
                          ? `${r.markup_percentage.toFixed(1)}%`
                          : r.markup_category}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <header className="border-b border-[var(--border)] bg-[var(--surface)] sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setSelectedRestaurant(null)}
                className="p-2 rounded-lg hover:bg-[var(--surface-hover)]"
              >
                <ArrowLeft size={20} />
              </button>
              <div>
                <h1 className="text-xl font-bold">{selectedRestaurant.name}</h1>
                <p className="text-sm text-[var(--muted)]">{selectedRestaurant.address}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span
                className={`px-3 py-1 rounded-full text-sm font-medium ${
                  selectedRestaurant.markup_category === "none"
                    ? "bg-emerald-100 text-emerald-700"
                    : selectedRestaurant.markup_category === "low"
                    ? "bg-blue-100 text-blue-700"
                    : selectedRestaurant.markup_category === "medium"
                    ? "bg-amber-100 text-amber-700"
                    : "bg-red-100 text-red-700"
                }`}
              >
                {selectedRestaurant.markup_percentage
                  ? `${selectedRestaurant.markup_percentage.toFixed(1)}% avg markup`
                  : "No markup data"}
              </span>
              <span className="text-sm text-[var(--muted)]">
                {matches.length} matches
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Matching Controls */}
      {(selectedUberEatsItem || selectedActualItem) && (
        <div className="sticky top-[73px] z-10 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800">
          <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
              <Link2 size={18} />
              <span className="text-sm font-medium">
                {selectedUberEatsItem && selectedActualItem
                  ? "Click 'Create Match' to link these items"
                  : selectedUberEatsItem
                  ? "Now select an actual menu item to match"
                  : "Now select a UberEats item to match"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {selectedUberEatsItem && selectedActualItem && (
                <button
                  onClick={handleCreateMatch}
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm font-medium"
                >
                  <Link2 size={16} />
                  Create Match
                </button>
              )}
              <button
                onClick={() => {
                  setSelectedUberEatsItem(null);
                  setSelectedActualItem(null);
                }}
                className="px-4 py-2 rounded-lg border border-blue-300 text-blue-700 hover:bg-blue-100 text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-6 py-6">
        <div className="grid grid-cols-2 gap-6">
          {/* UberEats Items (Left) */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <span className="text-2xl">🛵</span> UberEats Prices
              </h2>
              <span className="text-sm text-[var(--muted)]">{ubereatsItems.length} items</span>
            </div>

            {loading ? (
              <div className="text-center py-12 text-[var(--muted)]">Loading...</div>
            ) : ubereatsItems.length === 0 ? (
              <div className="text-center py-12 border-2 border-dashed border-[var(--border)] rounded-xl">
                <AlertCircle className="mx-auto mb-2 text-[var(--muted)]" size={32} />
                <p className="text-[var(--muted)]">No UberEats items scraped</p>
                <p className="text-sm text-[var(--muted)] mt-1">
                  Run the scraper to import items
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[calc(100vh-280px)] overflow-y-auto pr-2">
                {ubereatsItems.map((item) => {
                  const match = getMatchForUberEatsItem(item.id);
                  const isExpanded = expandedItemId === item.id;

                  return (
                    <div
                      key={item.id}
                      className={`p-3 rounded-xl border transition-all ${
                        match
                          ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800"
                          : isExpanded
                          ? "bg-blue-50 dark:bg-blue-900/20 border-blue-400 ring-2 ring-blue-400"
                          : "bg-[var(--surface)] border-[var(--border)] hover:border-[var(--accent)] cursor-pointer"
                      }`}
                    >
                      <div 
                        className="flex items-start justify-between gap-2"
                        onClick={() => {
                          if (match) return;
                          if (isExpanded) {
                            setExpandedItemId(null);
                            setQuickMatchPrice("");
                          } else {
                            setExpandedItemId(item.id);
                            setQuickMatchPrice("");
                          }
                        }}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{item.item_name}</p>
                          {item.category && (
                            <p className="text-xs text-[var(--muted)]">{item.category}</p>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="font-bold">{formatPrice(item.price)}</p>
                          {match && (
                            <p className={`text-xs font-medium ${getMarkupColor(match.markup_percentage)}`}>
                              +{match.markup_percentage.toFixed(1)}%
                            </p>
                          )}
                        </div>
                      </div>
                      
                      {/* Quick Match Inline Input */}
                      {isExpanded && !match && (
                        <div className="mt-3 pt-3 border-t border-blue-200 dark:border-blue-700">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-blue-600 dark:text-blue-400 whitespace-nowrap">
                              Actual price:
                            </span>
                            <div className="relative flex-1">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--muted)]">$</span>
                              <input
                                type="number"
                                step="0.01"
                                placeholder="0.00"
                                value={quickMatchPrice}
                                onChange={(e) => setQuickMatchPrice(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    handleQuickMatch(item.id);
                                  }
                                  if (e.key === "Escape") {
                                    setExpandedItemId(null);
                                    setQuickMatchPrice("");
                                  }
                                }}
                                className="w-full pl-7 pr-3 py-1.5 text-sm rounded-lg border border-blue-300 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400"
                                autoFocus
                              />
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleQuickMatch(item.id);
                              }}
                              disabled={saving || !quickMatchPrice}
                              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
                            >
                              {saving ? "..." : "Match"}
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedItemId(null);
                                setQuickMatchPrice("");
                              }}
                              className="p-1.5 text-gray-400 hover:text-gray-600"
                            >
                              <Unlink size={14} />
                            </button>
                          </div>
                          {quickMatchPrice && parseFloat(quickMatchPrice) > 0 && (
                            <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">
                              Markup: {(((item.price / 100) - parseFloat(quickMatchPrice)) / parseFloat(quickMatchPrice) * 100).toFixed(1)}%
                            </p>
                          )}
                        </div>
                      )}
                      
                      {match && (
                        <div className="mt-2 pt-2 border-t border-emerald-200 dark:border-emerald-700 flex items-center justify-between">
                          <span className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                            <Check size={12} /> Matched at {formatPrice(item.price - match.price_difference)}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteMatch(match.id);
                            }}
                            className="text-xs text-red-500 hover:underline"
                          >
                            Remove
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Panel - Ordering Options & Actual Menu */}
          <div>
            {/* Ordering Options - Always Visible */}
            <div className="mb-4 p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)]">
              <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                <ShoppingCart size={16} /> Ordering Options
              </h3>
              
              {/* Checkboxes */}
              <div className="space-y-2 mb-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hasOnlineOrdering}
                    onChange={(e) => setHasOnlineOrdering(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span className="text-sm">Online ordering available</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hasPhoneOrdering}
                    onChange={(e) => setHasPhoneOrdering(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                  />
                  <span className="text-sm">Phone ordering available</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isDeliveryAppOnly}
                    onChange={(e) => setIsDeliveryAppOnly(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
                  />
                  <span className="text-sm">Delivery app only (no direct ordering)</span>
                </label>
              </div>
              
              {/* Menu URL */}
              <div className="flex gap-2">
                <input
                  type="url"
                  placeholder="Menu URL (for customers to verify prices)"
                  value={menuUrl}
                  onChange={(e) => setMenuUrl(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm"
                />
                <button
                  onClick={handleSaveOrderingOptions}
                  disabled={saving}
                  className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
                >
                  {saving ? "..." : "Save"}
                </button>
              </div>
              {menuUrl && (
                <a 
                  href={menuUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="mt-2 text-xs text-blue-600 hover:underline flex items-center gap-1"
                >
                  <ExternalLink size={12} /> Open menu link
                </a>
              )}
            </div>

            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <span className="text-2xl">🍽️</span> Actual Menu Prices
              </h2>
              <span className="text-sm text-[var(--muted)]">{actualItems.length} items</span>
            </div>

            {/* Import from URL - Collapsible */}
            <div className="mb-4 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 overflow-hidden">
              <button
                onClick={() => setShowImportSection(!showImportSection)}
                className="w-full p-3 flex items-center justify-between text-left text-blue-700 dark:text-blue-300"
              >
                <span className="text-sm font-medium flex items-center gap-2">
                  <Globe size={16} /> Import from Website (Optional)
                </span>
                <span className="text-xs">{showImportSection ? "▼" : "▶"}</span>
              </button>
              
              {showImportSection && (
                <div className="px-4 pb-4">
                  <div className="flex gap-2">
                    <input
                      type="url"
                      placeholder="https://restaurant.com/menu"
                      value={importUrl}
                      onChange={(e) => setImportUrl(e.target.value)}
                      className="flex-1 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm"
                    />
                    <button
                      onClick={handleImportFromUrl}
                      disabled={!importUrl || importLoading}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                      title="Quick import - works for simple HTML pages"
                    >
                      {importLoading ? <RefreshCw size={16} className="animate-spin" /> : <Download size={16} />}
                      Quick
                    </button>
                    <button
                      onClick={handleBrowserScrape}
                      disabled={!importUrl || importLoading}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 disabled:opacity-50"
                      title="Browser scrape - for JavaScript sites"
                    >
                      {importLoading ? <RefreshCw size={16} className="animate-spin" /> : <Globe size={16} />}
                      Browser
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    Use <strong>Quick</strong> for simple HTML, <strong>Browser</strong> for JavaScript sites
                  </p>

                  {importError && (
                    <p className="mt-2 text-sm text-red-600 dark:text-red-400">{importError}</p>
                  )}

                  {/* Imported Items Preview */}
                  {importedItems.length > 0 && (
                    <div className="mt-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                          Found {importedItems.length} items
                        </span>
                        <div className="flex items-center gap-2">
                          {hasOrderingSystem && (
                            <span className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-emerald-100 text-emerald-700">
                              <ShoppingCart size={12} /> Online Ordering
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="max-h-48 overflow-y-auto space-y-1">
                        {importedItems.slice(0, 15).map((item, idx) => (
                          <div key={idx} className="flex justify-between text-sm p-2 bg-white dark:bg-gray-800 rounded">
                            <span className="truncate">{item.name}</span>
                            <span className="font-medium text-emerald-600">${item.price.toFixed(2)}</span>
                          </div>
                        ))}
                        {importedItems.length > 15 && (
                          <p className="text-xs text-[var(--muted)] text-center py-1">
                            +{importedItems.length - 15} more items
                          </p>
                        )}
                      </div>
                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={handleAddAllImported}
                          disabled={saving}
                          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
                        >
                          <Check size={16} />
                          Add All {importedItems.length} Items
                        </button>
                        <button
                          onClick={() => {
                            setImportedItems([]);
                            setImportError(null);
                            setHasOrderingSystem(false);
                          }}
                          className="px-4 py-2 rounded-lg border border-[var(--border)] text-sm font-medium hover:bg-[var(--surface-hover)]"
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Add New Item Form (Manual) */}
            <div className="mb-4 p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)]">
              <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                <Plus size={16} /> Add Manually
              </h3>
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="text"
                  placeholder="Item name"
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  className="col-span-2 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm"
                />
                <input
                  type="number"
                  placeholder="Price"
                  step="0.01"
                  value={newItemPrice}
                  onChange={(e) => setNewItemPrice(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm"
                />
              </div>
              <div className="flex items-center gap-2 mt-2">
                <input
                  type="text"
                  placeholder="Category (optional)"
                  value={newItemCategory}
                  onChange={(e) => setNewItemCategory(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm"
                />
                <button
                  onClick={handleAddActualItem}
                  disabled={!newItemName || !newItemPrice || saving}
                  className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
                >
                  Add
                </button>
              </div>
            </div>

            {actualItems.length === 0 ? (
              <div className="text-center py-12 border-2 border-dashed border-[var(--border)] rounded-xl">
                <AlertCircle className="mx-auto mb-2 text-[var(--muted)]" size={32} />
                <p className="text-[var(--muted)]">No actual prices added</p>
                <p className="text-sm text-[var(--muted)] mt-1">
                  Add items above to compare with UberEats
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[calc(100vh-420px)] overflow-y-auto pr-2">
                {actualItems.map((item) => {
                  const match = getMatchForActualItem(item.id);
                  const isSelected = selectedActualItem === item.id;

                  return (
                    <div
                      key={item.id}
                      onClick={() => {
                        if (match) return;
                        setSelectedActualItem(isSelected ? null : item.id);
                      }}
                      className={`p-3 rounded-xl border transition-all ${
                        match
                          ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800"
                          : isSelected
                          ? "bg-blue-50 dark:bg-blue-900/20 border-blue-400 ring-2 ring-blue-400"
                          : "bg-[var(--surface)] border-[var(--border)] hover:border-[var(--accent)] cursor-pointer"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{item.item_name}</p>
                          {item.category && (
                            <p className="text-xs text-[var(--muted)]">{item.category}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <p className="font-bold">{formatPrice(item.price)}</p>
                          {!match && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteActualItem(item.id);
                              }}
                              className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30"
                            >
                              <Trash2 size={14} className="text-red-500" />
                            </button>
                          )}
                        </div>
                      </div>
                      {match && (
                        <div className="mt-2 pt-2 border-t border-emerald-200 dark:border-emerald-700">
                          <span className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                            <Check size={12} /> Matched to UberEats item
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
