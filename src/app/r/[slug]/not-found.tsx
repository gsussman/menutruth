import Link from "next/link";

export default function RestaurantNotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--background)] px-4">
      <h1
        className="text-3xl font-semibold mb-2"
        style={{ fontFamily: "var(--font-instrument-serif), serif" }}
      >
        Restaurant not found
      </h1>
      <p className="text-[var(--muted)] mb-6 text-center">
        This share link may be outdated or the restaurant was removed.
      </p>
      <Link
        href="/"
        className="px-4 py-2 rounded-full bg-[var(--accent)] text-white text-sm font-medium hover:opacity-90"
      >
        Back to MenuTruth
      </Link>
    </div>
  );
}
