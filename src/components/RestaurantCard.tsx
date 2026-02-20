"use client";

import { Restaurant } from "@/lib/types";
import { MarkupBadge } from "./MarkupBadge";
import { Phone, Globe, ExternalLink, MapPin, Truck, Store } from "lucide-react";

interface RestaurantCardProps {
  restaurant: Restaurant;
  onClick?: () => void;
  isSelected?: boolean;
}

const cuisineEmojis: Record<string, string> = {
  american: "🍔",
  asian: "🥡",
  chinese: "🥢",
  indian: "🍛",
  italian: "🍝",
  japanese: "🍣",
  korean: "🍜",
  mediterranean: "🥙",
  mexican: "🌮",
  pizza: "🍕",
  thai: "🍲",
  vietnamese: "🍜",
  deli: "🥪",
  seafood: "🦞",
  other: "🍽️",
};

export function RestaurantCard({
  restaurant,
  onClick,
  isSelected,
}: RestaurantCardProps) {
  const primaryCuisine = restaurant.cuisines[0] || "other";
  const emoji = cuisineEmojis[primaryCuisine] || "🍽️";

  return (
    <div
      onClick={onClick}
      className={`
        group cursor-pointer rounded-2xl border p-4 transition-all duration-200
        ${
          isSelected
            ? "border-[var(--accent)] bg-[var(--surface)] shadow-lg ring-2 ring-[var(--accent)]/20"
            : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--accent)]/50 hover:shadow-md"
        }
      `}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="text-2xl" role="img" aria-label={primaryCuisine}>
            {emoji}
          </span>
          <div>
            <h3 className="font-semibold text-[var(--foreground)] group-hover:text-[var(--accent)] transition-colors">
              {restaurant.name}
            </h3>
            <p className="text-sm text-[var(--muted)] capitalize">
              {restaurant.cuisines.join(" · ")}
            </p>
          </div>
        </div>
        <MarkupBadge
          category={restaurant.markup_category}
          percentage={restaurant.markup_percentage}
          size="sm"
        />
      </div>

      {/* Address */}
      <div className="mt-3 flex items-center gap-2 text-sm text-[var(--muted)]">
        <MapPin size={14} />
        <span>{restaurant.address || "Upper West Side, NYC"}</span>
      </div>

      {/* Delivery Options */}
      <div className="mt-3 flex flex-wrap gap-2">
        {restaurant.has_direct_delivery && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
            <Truck size={12} />
            Direct Delivery
          </span>
        )}
        {restaurant.has_pickup && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 dark:bg-blue-900/40 px-2.5 py-1 text-xs font-medium text-blue-700 dark:text-blue-300">
            <Store size={12} />
            Pickup
          </span>
        )}
      </div>

      {/* Links */}
      <div className="mt-4 flex items-center gap-4 border-t border-[var(--border)] pt-4">
        {restaurant.direct_ordering_url && (
          <a
            href={restaurant.direct_ordering_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--accent)] hover:underline"
          >
            <Globe size={14} />
            Order Direct
            <ExternalLink size={12} />
          </a>
        )}
        {restaurant.phone_number && (
          <a
            href={`tel:${restaurant.phone_number}`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1.5 text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
          >
            <Phone size={14} />
            {restaurant.phone_number}
          </a>
        )}
        {restaurant.website_url && !restaurant.direct_ordering_url && (
          <a
            href={restaurant.website_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1.5 text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
          >
            <Globe size={14} />
            Website
          </a>
        )}
      </div>
    </div>
  );
}
