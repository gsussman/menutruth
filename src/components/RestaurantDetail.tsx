"use client";

import { Restaurant, ItemMatchWithItems } from "@/lib/types";
import { MarkupBadge } from "./MarkupBadge";
import {
  X,
  Phone,
  Globe,
  ExternalLink,
  MapPin,
  Truck,
  Store,
  Flag,
  Clock,
} from "lucide-react";

interface RestaurantDetailProps {
  restaurant: Restaurant;
  itemMatches?: ItemMatchWithItems[];
  onClose: () => void;
  onFlag?: () => void;
}

export function RestaurantDetail({
  restaurant,
  itemMatches = [],
  onClose,
  onFlag,
}: RestaurantDetailProps) {
  const verifiedDate = new Date(restaurant.last_verified_at).toLocaleDateString(
    "en-US",
    {
      month: "short",
      day: "numeric",
      year: "numeric",
    }
  );

  return (
    <div className="h-full overflow-y-auto bg-[var(--surface)] animate-slide-in">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[var(--surface)] border-b border-[var(--border)] px-6 py-4">
        <div className="flex items-start justify-between">
          <div>
            <h2
              className="text-2xl font-semibold text-[var(--foreground)]"
              style={{ fontFamily: "var(--font-instrument-serif), serif" }}
            >
              {restaurant.name}
            </h2>
            <p className="text-sm text-[var(--muted)] capitalize mt-1">
              {restaurant.cuisines.join(" · ")}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-[var(--surface-hover)] transition-colors"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Markup Badge */}
        <div className="mt-4">
          <MarkupBadge
            category={restaurant.markup_category}
            percentage={restaurant.markup_percentage}
            size="lg"
          />
        </div>
      </div>

      {/* Content */}
      <div className="px-6 py-6 space-y-6">
        {/* Info */}
        <div className="space-y-3">
          <div className="flex items-center gap-3 text-[var(--foreground)]">
            <MapPin size={18} className="text-[var(--muted)]" />
            <span>{restaurant.address || "Upper West Side, NYC"}</span>
          </div>
          {restaurant.phone_number && (
            <div className="flex items-center gap-3">
              <Phone size={18} className="text-[var(--muted)]" />
              <a
                href={`tel:${restaurant.phone_number}`}
                className="text-[var(--accent)] hover:underline"
              >
                {restaurant.phone_number}
              </a>
            </div>
          )}
          <div className="flex items-center gap-3 text-sm text-[var(--muted)]">
            <Clock size={18} />
            <span>Prices verified: {verifiedDate}</span>
          </div>
        </div>

        {/* Ordering Options */}
        <div className="space-y-3">
          <h3 className="font-semibold text-[var(--foreground)]">
            Ordering Options
          </h3>
          <div className="space-y-2">
            {restaurant.has_direct_delivery && (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
                <Truck size={20} className="text-emerald-600" />
                <div className="flex-1">
                  <p className="font-medium text-emerald-800 dark:text-emerald-200">
                    Direct Delivery Available
                  </p>
                  <p className="text-sm text-emerald-600 dark:text-emerald-400">
                    Order directly and skip the markup
                  </p>
                </div>
                {restaurant.direct_ordering_url && (
                  <a
                    href={restaurant.direct_ordering_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-4 py-2 rounded-full bg-emerald-600 text-white font-medium text-sm hover:bg-emerald-700 transition-colors"
                  >
                    Order Now
                    <ExternalLink size={14} />
                  </a>
                )}
              </div>
            )}
            {restaurant.has_pickup && (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                <Store size={20} className="text-blue-600" />
                <div className="flex-1">
                  <p className="font-medium text-blue-800 dark:text-blue-200">
                    Pickup Available
                  </p>
                  <p className="text-sm text-blue-600 dark:text-blue-400">
                    Call ahead or order online for pickup
                  </p>
                </div>
              </div>
            )}
            {restaurant.ubereats_url && (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-[var(--surface-hover)] border border-[var(--border)]">
                <span className="text-xl">🍔</span>
                <div className="flex-1">
                  <p className="font-medium text-[var(--foreground)]">
                    UberEats
                  </p>
                  <p className="text-sm text-[var(--muted)]">
                    {restaurant.markup_category !== "none"
                      ? `~${Math.round(restaurant.markup_percentage || 0)}% markup on prices`
                      : "Prices match restaurant menu"}
                  </p>
                </div>
                <a
                  href={restaurant.ubereats_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-4 py-2 rounded-full bg-[var(--border)] text-[var(--foreground)] font-medium text-sm hover:bg-[var(--muted)] hover:text-white transition-colors"
                >
                  View
                  <ExternalLink size={14} />
                </a>
              </div>
            )}
          </div>
        </div>

        {/* Price Comparison */}
        {itemMatches.length > 0 && (
          <div className="space-y-3">
            <h3 className="font-semibold text-[var(--foreground)]">
              Sample Price Comparison
            </h3>
            <div className="overflow-hidden rounded-xl border border-[var(--border)]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[var(--surface-hover)]">
                    <th className="px-4 py-3 text-left font-medium text-[var(--muted)]">
                      Item
                    </th>
                    <th className="px-4 py-3 text-right font-medium text-[var(--muted)]">
                      Actual
                    </th>
                    <th className="px-4 py-3 text-right font-medium text-[var(--muted)]">
                      UberEats
                    </th>
                    <th className="px-4 py-3 text-right font-medium text-[var(--muted)]">
                      Markup
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {itemMatches.slice(0, 5).map((match, idx) => (
                    <tr
                      key={match.id}
                      className={
                        idx % 2 === 0
                          ? "bg-[var(--surface)]"
                          : "bg-[var(--surface-hover)]/50"
                      }
                    >
                      <td className="px-4 py-3 text-[var(--foreground)]">
                        {match.actual_menu_item?.item_name ||
                          match.ubereats_item?.item_name ||
                          "Unknown"}
                      </td>
                      <td className="px-4 py-3 text-right text-[var(--foreground)]">
                        ${((match.actual_menu_item?.price || 0) / 100).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right text-[var(--foreground)]">
                        ${((match.ubereats_item?.price || 0) / 100).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {match.markup_percentage > 0 ? (
                          <span className="text-red-600 font-medium">
                            +{Math.round(match.markup_percentage)}%
                          </span>
                        ) : (
                          <span className="text-emerald-600 font-medium">
                            Same
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Flag Button */}
        {onFlag && (
          <button
            onClick={onFlag}
            className="flex items-center gap-2 text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
          >
            <Flag size={16} />
            Report outdated information
          </button>
        )}
      </div>
    </div>
  );
}
