/**
 * Canonical public site URL (no trailing slash).
 * Prefer NEXT_PUBLIC_SITE_URL; fall back to the production domain.
 */
export function getSiteUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  // Production default after custom domain setup
  if (process.env.VERCEL_ENV === "production") {
    return "https://www.menutruth.com";
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return "http://localhost:3000";
}
