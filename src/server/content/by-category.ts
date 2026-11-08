import { createClient } from "@supabase/supabase-js";
import { DEMO_ARTICLES } from "./demo";
import { contentMode } from "./repository";
import type { ArticleCard } from "./types";

function toCard(a: (typeof DEMO_ARTICLES)[number]): ArticleCard {
  const { bodyHtml: _b, tags: _t, aiProvenance: _p, ...card } = a;
  return card;
}

export async function getArticlesByCategory(
  categorySlug: string,
): Promise<{ articles: ArticleCard[]; isDemoData: boolean; contentUnavailable: boolean }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    if (process.env.NODE_ENV === "production") {
      // Honest empty result: the page renders a configuration notice, not a fake list.
      return { articles: [], isDemoData: false, contentUnavailable: true };
    }
    return {
      articles: DEMO_ARTICLES.filter((a) => a.categorySlug === categorySlug).map(toCard),
      isDemoData: contentMode() === "demo",
      contentUnavailable: false,
    };
  }

  const db = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await db
    .from("published_articles")
    .select(
      "slug,title,dek,category_slug,category_name,publish_at,reading_minutes,hero_image_url,hero_image_alt,author_slug,author_name,author_role,author_bio,is_exclusive,ai_assisted",
    )
    .eq("category_slug", categorySlug)
    .order("publish_at", { ascending: false })
    .limit(30);

  if (error) throw new Error(`Failed to load category articles: ${error.message}`);

  return {
    articles: (data ?? []).map((row) => ({
      slug: row.slug as string,
      title: row.title as string,
      dek: (row.dek as string | null) ?? "",
      categorySlug: (row.category_slug as string | null) ?? categorySlug,
      categoryName: (row.category_name as string | null) ?? "News",
      publishedAt: (row.publish_at as string | null) ?? null,
      readingMinutes: (row.reading_minutes as number | null) ?? 3,
      imageUrl: (row.hero_image_url as string | null) ?? null,
      imageAlt: (row.hero_image_alt as string | null) ?? (row.title as string),
      author: row.author_slug
        ? {
            slug: row.author_slug as string,
            name: (row.author_name as string | null) ?? "American Signal Desk",
            role: (row.author_role as string | null) ?? "Reporter",
            bio: (row.author_bio as string | null) ?? "",
          }
        : null,
      isExclusive: (row.is_exclusive as boolean | null) ?? false,
      isAiAssisted: (row.ai_assisted as boolean | null) ?? false,
    })),
    isDemoData: false,
    contentUnavailable: false,
  };
}
