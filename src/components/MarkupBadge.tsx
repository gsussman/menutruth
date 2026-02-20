"use client";

import { MarkupCategory } from "@/lib/types";

interface MarkupBadgeProps {
  category: MarkupCategory;
  percentage?: number | null;
  size?: "sm" | "md" | "lg";
}

const categoryConfig: Record<
  MarkupCategory,
  { label: string; bg: string; text: string; icon: string }
> = {
  none: {
    label: "No Markup",
    bg: "bg-emerald-100 dark:bg-emerald-900/40",
    text: "text-emerald-700 dark:text-emerald-300",
    icon: "✓",
  },
  low: {
    label: "Low Markup",
    bg: "bg-lime-100 dark:bg-lime-900/40",
    text: "text-lime-700 dark:text-lime-300",
    icon: "↑",
  },
  medium: {
    label: "Medium Markup",
    bg: "bg-amber-100 dark:bg-amber-900/40",
    text: "text-amber-700 dark:text-amber-300",
    icon: "↑↑",
  },
  high: {
    label: "High Markup",
    bg: "bg-red-100 dark:bg-red-900/40",
    text: "text-red-700 dark:text-red-300",
    icon: "↑↑↑",
  },
};

const sizeClasses = {
  sm: "text-xs px-2 py-0.5",
  md: "text-sm px-2.5 py-1",
  lg: "text-base px-3 py-1.5",
};

export function MarkupBadge({
  category,
  percentage,
  size = "md",
}: MarkupBadgeProps) {
  const config = categoryConfig[category];

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium ${config.bg} ${config.text} ${sizeClasses[size]}`}
    >
      <span>{config.icon}</span>
      <span>{config.label}</span>
      {percentage !== undefined && percentage !== null && percentage > 0 && (
        <span className="opacity-80">~{Math.round(percentage)}%</span>
      )}
    </span>
  );
}
