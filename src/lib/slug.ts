/**
 * Convert a restaurant name into a URL-safe slug.
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 80);
}

/**
 * Build a unique slug, appending a short disambiguator when needed.
 */
export function uniqueSlug(name: string, id: string, existing: Set<string>): string {
  const base = slugify(name) || `restaurant-${id.slice(0, 8)}`;
  if (!existing.has(base)) return base;
  const suffix = id.replace(/-/g, "").slice(0, 6);
  let candidate = `${base}-${suffix}`;
  let n = 2;
  while (existing.has(candidate)) {
    candidate = `${base}-${suffix}-${n}`;
    n += 1;
  }
  return candidate;
}

export function restaurantSharePath(slug: string): string {
  return `/r/${slug}`;
}
