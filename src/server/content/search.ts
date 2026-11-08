import { createClient } from "@supabase/supabase-js";
import { DEMO_ARTICLES } from "./demo";
import { contentMode } from "./repository";
import type { ArticleCard } from "./types";

/**
 * Search.
 *
 * Live mode uses PostgreSQL full-text search through an RPC (`search_articles`), so no
 * article rows are ever fetched into the application to be filtered in memory. In demo
 * mode a simple in-memory filter over the synthetic fixtures is used and clearly flagged.
 */

function toCard(a: (typeof DEMO_ARTICLES)[number]): ArticleCard {
  const { bodyHtml: _b, tags: _t, aiProvenance: _p, ...card } = a;
  return card;
}

export interface SearchOutcome {
  results: ArticleCard[];
  isDemoData: boolean;
  mode: "live" | "demo" | "unavailable";
}

export async function searchArticles(query: string): Promise<SearchOutcome> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    if (process.env.NODE_ENV === "production") {
      return { results: [], isDemoData: false, mode: "unavailable" };
    }
    const needle = query.toLowerCase();
    const results = DEMO_ARTICLES.filter(
      (a) =>
        a.title.toLowerCase().includes(needle) ||
        a.dek.toLowerCase().includes(needle) ||
        a.tags.some((t) => t.includes(needle)),
    ).map(toCard);
    return { results, isDemoData: contentMode() === "demo", mode: "demo" };
  }

  const db = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await db.rpc("search_articles", { q: query, max_rows: 30 });

  if (error) {
    // Degrade to an explicit failure rather than a misleading empty result set.
    console.error(`[search] rpc failed: ${error.message}`);
    return { results: [], isDemoData: false, mode: "unavailable" };
  }

  const rows = (data ?? []) as Record<string, unknown>[];
  return {
    results: rows.map((row) => ({
      slug: String(row.slug),
      title: String(row.title),
      dek: (row.dek as string | null) ?? "",
      categorySlug: (row.category_slug as string | null) ?? "news",
      categoryName: (row.category_name as string | null) ?? "News",
      publishedAt: (row.publish_at as string | null) ?? null,
      readingMinutes: (row.reading_minutes as number | null) ?? 3,
      imageUrl: (row.hero_image_url as string | null) ?? null,
      imageAlt: (row.hero_image_alt as string | null) ?? String(row.title),
      author: null,
      isExclusive: false,
      isAiAssisted: (row.ai_assisted as boolean | null) ?? false,
    })),
    isDemoData: false,
    mode: "live",
  };
}
