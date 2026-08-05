import type { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = "https://menutruth.vercel.app";
  const entries: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
  ];

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return entries;

  const supabase = createClient(url, key);
  const { data } = await supabase
    .from("restaurants")
    .select("slug, updated_at")
    .not("markup_percentage", "is", null)
    .not("slug", "is", null);

  if (data) {
    for (const r of data) {
      if (!r.slug) continue;
      entries.push({
        url: `${baseUrl}/r/${r.slug}`,
        lastModified: r.updated_at ? new Date(r.updated_at) : new Date(),
        changeFrequency: "weekly",
        priority: 0.8,
      });
    }
  }

  return entries;
}
