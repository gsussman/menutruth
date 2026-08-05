"use client";

import { useRouter } from "next/navigation";
import { Restaurant, ItemMatchWithItems } from "@/lib/types";
import { RestaurantDetail } from "@/components/RestaurantDetail";
import { submitFlag } from "@/lib/data";

interface RestaurantShareClientProps {
  restaurant: Restaurant;
  itemMatches: ItemMatchWithItems[];
}

export function RestaurantShareClient({
  restaurant,
  itemMatches,
}: RestaurantShareClientProps) {
  const router = useRouter();

  const handleFlag = async () => {
    const success = await submitFlag(restaurant.id, "outdated_prices");
    if (success) {
      alert("Thanks for letting us know! We'll review this soon.");
    } else {
      alert("Something went wrong. Please try again.");
    }
  };

  return (
    <RestaurantDetail
      restaurant={restaurant}
      itemMatches={itemMatches}
      onClose={() => router.push(restaurant.slug ? `/?r=${restaurant.slug}` : "/")}
      onFlag={handleFlag}
      showShare
      showOpenPage={false}
    />
  );
}
