"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import { Restaurant, MarkupCategory } from "@/lib/types";

interface MapProps {
  restaurants: Restaurant[];
  selectedRestaurant?: Restaurant | null;
  onSelectRestaurant: (restaurant: Restaurant, fromMap: boolean) => void;
  shouldFlyTo?: boolean;
}

const markupColors: Record<MarkupCategory, string> = {
  none: "#10b981", // emerald
  low: "#84cc16", // lime
  medium: "#f59e0b", // amber
  high: "#ef4444", // red
};

// Southern Central Park - shows both UWS and Midtown
const MANHATTAN_CENTER: [number, number] = [-73.975, 40.768];
const DEFAULT_ZOOM = 12;

export function Map({
  restaurants,
  selectedRestaurant,
  onSelectRestaurant,
  shouldFlyTo = false,
}: MapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const [mapLoaded, setMapLoaded] = useState(false);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) {
      console.error("Mapbox token not found");
      return;
    }

    mapboxgl.accessToken = token;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/light-v11",
      center: MANHATTAN_CENTER,
      zoom: DEFAULT_ZOOM,
    });

    map.current.addControl(new mapboxgl.NavigationControl(), "top-right");

    map.current.on("load", () => {
      setMapLoaded(true);
    });

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Resize map when container size changes (e.g., when sidebar collapses)
  useEffect(() => {
    if (!mapContainer.current) return;

    const resizeObserver = new ResizeObserver(() => {
      if (map.current) {
        map.current.resize();
      }
    });

    resizeObserver.observe(mapContainer.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // Update markers when restaurants change
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    // Clear existing markers
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    // Add new markers
    restaurants.forEach((restaurant) => {
      if (!restaurant.latitude || !restaurant.longitude) return;

      const color = markupColors[restaurant.markup_category];
      const isSelected = selectedRestaurant?.id === restaurant.id;

      // Create custom marker element
      const el = document.createElement("div");
      el.className = "marker";
      
      const baseSize = isSelected ? 32 : 24;
      const hoverSize = isSelected ? 36 : 30;
      
      el.style.cssText = `
        width: ${baseSize}px;
        height: ${baseSize}px;
        background-color: ${color};
        border: 3px solid white;
        border-radius: 50%;
        cursor: pointer;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        transition: width 0.15s ease, height 0.15s ease, margin 0.15s ease;
        margin: 0;
      `;

      el.addEventListener("mouseenter", () => {
        const offset = (hoverSize - baseSize) / 2;
        el.style.width = `${hoverSize}px`;
        el.style.height = `${hoverSize}px`;
        el.style.marginLeft = `-${offset}px`;
        el.style.marginTop = `-${offset}px`;
      });
      el.addEventListener("mouseleave", () => {
        el.style.width = `${baseSize}px`;
        el.style.height = `${baseSize}px`;
        el.style.marginLeft = "0";
        el.style.marginTop = "0";
      });
      el.addEventListener("click", () => {
        onSelectRestaurant(restaurant, true);
      });

      const marker = new mapboxgl.Marker(el)
        .setLngLat([restaurant.longitude, restaurant.latitude])
        .addTo(map.current!);

      markersRef.current.push(marker);
    });
  }, [restaurants, selectedRestaurant, mapLoaded, onSelectRestaurant]);

  // Fly to selected restaurant (only when shouldFlyTo is true)
  useEffect(() => {
    if (!map.current || !selectedRestaurant || !mapLoaded || !shouldFlyTo) return;

    if (selectedRestaurant.latitude && selectedRestaurant.longitude) {
      map.current.flyTo({
        center: [selectedRestaurant.longitude, selectedRestaurant.latitude],
        zoom: 16,
        duration: 1000,
      });
    }
  }, [selectedRestaurant, mapLoaded, shouldFlyTo]);

  return (
    <div className="relative w-full h-full rounded-2xl overflow-hidden">
      <div ref={mapContainer} className="w-full h-full" />

      {/* Legend */}
      <div className="absolute bottom-4 left-4 bg-white/95 dark:bg-[var(--surface)]/95 backdrop-blur-sm rounded-xl p-3 shadow-lg">
        <p className="text-xs font-medium text-[var(--muted)] mb-2">
          Markup Level
        </p>
        <div className="space-y-1.5">
          {(
            [
              { key: "none", label: "None" },
              { key: "low", label: "Low" },
              { key: "medium", label: "Medium" },
              { key: "high", label: "High" },
            ] as const
          ).map(({ key, label }) => (
            <div key={key} className="flex items-center gap-2">
              <span
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: markupColors[key] }}
              />
              <span className="text-xs text-[var(--foreground)]">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* No token warning */}
      {!process.env.NEXT_PUBLIC_MAPBOX_TOKEN && (
        <div className="absolute inset-0 flex items-center justify-center bg-[var(--surface)]">
          <div className="text-center p-6">
            <p className="text-[var(--muted)]">
              Map requires Mapbox token.
              <br />
              Add NEXT_PUBLIC_MAPBOX_TOKEN to .env.local
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
