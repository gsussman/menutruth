import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Header } from "@/components/Header";
import { RestaurantShareClient } from "@/components/RestaurantShareClient";
import { getRestaurantBySlug, getItemMatchesForRestaurant } from "@/lib/data";
import { getSiteUrl } from "@/lib/site-url";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const restaurant = await getRestaurantBySlug(slug);

  if (!restaurant) {
    return {
      title: "Restaurant not found | MenuTruth",
    };
  }

  const markup =
    restaurant.markup_percentage != null
      ? `~${Math.round(restaurant.markup_percentage)}% Uber Eats markup`
      : "delivery price comparison";

  const title = `${restaurant.name} — ${markup} | MenuTruth`;
  const description = `See how ${restaurant.name} prices on Uber Eats compare to the restaurant menu. ${markup}. Find direct ordering options and save on delivery.`;
  const url = `${getSiteUrl()}/r/${restaurant.slug}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: "MenuTruth",
      type: "website",
      locale: "en_US",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function RestaurantSharePage({ params }: PageProps) {
  const { slug } = await params;
  const restaurant = await getRestaurantBySlug(slug);

  if (!restaurant) {
    notFound();
  }

  const itemMatches = await getItemMatchesForRestaurant(restaurant.id);

  return (
    <div className="min-h-screen flex flex-col bg-[var(--background)]">
      <Header />
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-6">
        <Link
          href={restaurant.slug ? `/?r=${restaurant.slug}` : "/"}
          className="inline-flex items-center gap-2 text-sm text-[var(--muted)] hover:text-[var(--foreground)] mb-4"
        >
          <ArrowLeft size={16} />
          Browse all restaurants
        </Link>
        <div className="rounded-2xl border border-[var(--border)] overflow-hidden bg-[var(--surface)] shadow-sm">
          <RestaurantShareClient restaurant={restaurant} itemMatches={itemMatches} />
        </div>
      </main>
    </div>
  );
}
