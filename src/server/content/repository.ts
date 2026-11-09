/**
 * Public content repository.
 *
 * Three modes, decided explicitly and never silently:
 *   - LIVE  : Supabase is configured → parameterised queries against published rows only.
 *   - DEMO  : no Supabase during development → clearly-labelled sample content (banner shown).
 *   - NONE  : no Supabase in a production build (preview, CI, or a misconfigured deploy)
 *             → an explicit "unavailable" state. We never invent news for real readers, and
 *             we never crash the build either: the page renders a truthful notice and a 503.
 *
 * Security note: this module only ever reads `articles` where status = 'published' and
 * publish_at <= now(). Private columns (drafts, revision history, unpublished bodies) are
 * not selected, so they cannot leak even if a policy is later misconfigured.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { demoArticle, demoHomePage, DEMO_CATEGORIES } from "./demo";
import type { Article, ArticleCard, ArticlePageData, Category, HomePageData } from "./types";

export type ContentMode = "live" | "demo" | "unavailable";

let client: SupabaseClient | null = null;

function supabase(): SupabaseClient | null {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

export function contentMode(): ContentMode {
  if (supabase()) return "live";
  if (process.env.NODE_ENV === "production") return "unavailable";
  // Design preview mode. Without it, a production build with no database is a dead end:
  // the layout cannot be reviewed before a Supabase project exists, and the UI work is
  // unverifiable. The trade-off is deliberate and tightly bounded:
  //   - only reachable when the database is absent (a configured DB always wins)
  //   - only samples ship, and every one is marked isDemoData, which forces the visible
  //     "Sample content - not real reporting" banner on every public page
  //   - the health endpoint still reports degraded, and the admin refuses sign-in
  // It never invents a metric, a visitor count or a quote from a real person.
  if (process.env.ASD_ALLOW_SAMPLE_CONTENT === "1") return "demo";
  return "unavailable";
}

/**
 * Returns the mode the caller should render for. `unavailable` is a first-class outcome:
 * callers must render an honest notice rather than falling back to sample news.
 */
function assertReadable(): ContentMode {
  return contentMode();
}

/** Columns that are safe to expose publicly. */
const PUBLIC_COLUMNS = [
  "slug",
  "title",
  "dek",
  "category_slug",
  "category_name",
  "publish_at",
  "reading_minutes",
  "hero_image_url",
  "hero_image_alt",
  "author_slug",
  "author_name",
  "author_role",
  "author_bio",
  "is_exclusive",
  "ai_assisted",
].join(",");

type PublicRow = {
  slug: string;
  title: string;
  dek: string | null;
  category_slug: string | null;
  category_name: string | null;
  publish_at: string | null;
  reading_minutes: number | null;
  hero_image_url: string | null;
  hero_image_alt: string | null;
  author_slug: string | null;
  author_name: string | null;
  author_role: string | null;
  author_bio: string | null;
  is_exclusive: boolean | null;
  ai_assisted: boolean | null;
};

function rowToCard(row: PublicRow): ArticleCard {
  return {
    slug: row.slug,
    title: row.title,
    dek: row.dek ?? "",
    categorySlug: row.category_slug ?? "news",
    categoryName: row.category_name ?? "News",
    publishedAt: row.publish_at,
    readingMinutes: row.reading_minutes ?? 3,
    imageUrl: row.hero_image_url,
    imageAlt: row.hero_image_alt ?? row.title,
    author: row.author_slug
      ? {
          slug: row.author_slug,
          name: row.author_name ?? "American Signal Desk",
          role: row.author_role ?? "Reporter",
          bio: row.author_bio ?? "",
        }
      : null,
    isExclusive: row.is_exclusive ?? false,
    isAiAssisted: row.ai_assisted ?? false,
  };
}

export async function getCategories(): Promise<Category[]> {
  const mode = assertReadable();
  if (mode === "demo") return DEMO_CATEGORIES;
  if (mode === "unavailable") return [];
  const db = supabase();
  if (!db) return [];
  const { data, error } = await db
    .from("categories")
    .select("slug,name,description")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(`Failed to load categories: ${error.message}`);
  return (data ?? []) as Category[];
}

const UNAVAILABLE_LEAD: ArticleCard = {
  slug: "",
  title: "Content is temporarily unavailable",
  dek: "The editorial database is not configured for this environment, so no stories can be shown. This is not an empty newsroom — it is a configuration gap.",
  categorySlug: "us-news",
  categoryName: "System",
  publishedAt: null,
  readingMinutes: 1,
  imageUrl: null,
  imageAlt: "",
  author: null,
};

export async function getHomePage(): Promise<HomePageData> {
  const mode = assertReadable();
  if (mode === "demo") return demoHomePage();
  if (mode === "unavailable") {
    return {
      lead: UNAVAILABLE_LEAD,
      secondary: [],
      latest: [],
      editorsPicks: [],
      mostRead: [],
      categories: [],
      isDemoData: false,
      isUnavailable: true,
    };
  }

  const db = supabase();
  if (!db) throw new Error("Supabase client unavailable");

  const { data, error } = await db
    .from("published_articles")
    .select(PUBLIC_COLUMNS)
    .order("publish_at", { ascending: false })
    .limit(20);

  if (error) throw new Error(`Failed to load published articles: ${error.message}`);

  const cards = ((data ?? []) as unknown as PublicRow[]).map(rowToCard);
  const lead = cards[0];
  if (!lead) {
    // A real, empty newsroom. Not an error — the UI shows a genuine empty state.
    return {
      lead: EMPTY_LEAD,
      secondary: [],
      latest: [],
      editorsPicks: [],
      mostRead: [],
      categories: await getCategories(),
      isDemoData: false,
      isUnavailable: false,
    };
  }

  return {
    lead,
    secondary: cards.slice(1, 4),
    latest: cards.slice(1, 9),
    editorsPicks: cards.slice(4, 8),
    mostRead: cards.slice(0, 5).map((c) => ({ title: c.title, slug: c.slug })),
    categories: await getCategories(),
    isDemoData: false,
    isUnavailable: false,
  };
}

const EMPTY_LEAD: ArticleCard = {
  slug: "",
  title: "No articles have been published yet",
  dek: "Once an editor publishes the first story it will appear here.",
  categorySlug: "us-news",
  categoryName: "News",
  publishedAt: null,
  readingMinutes: 1,
  imageUrl: null,
  imageAlt: "",
  author: null,
};

export async function getArticle(slug: string): Promise<ArticlePageData | null> {
  const mode = assertReadable();
  if (mode === "unavailable") return null;
  if (mode === "demo") {
    const article = demoArticle(slug);
    if (!article) return null;
    return { article, related: demoHomePage().latest.slice(0, 3), isDemoData: true };
  }

  const db = supabase();
  if (!db) return null;

  const { data, error } = await db
    .from("published_articles")
    .select(`${PUBLIC_COLUMNS},body_html,tags`)
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw new Error(`Failed to load article: ${error.message}`);
  if (!data) return null;

  const row = data as unknown as PublicRow & { body_html: string | null; tags: string[] | null };
  const card = rowToCard(row);
  const article: Article = {
    ...card,
    bodyHtml: row.body_html ?? "",
    updatedAt: null,
    tags: row.tags ?? [],
    aiProvenance: row.ai_assisted
      ? { assisted: true, model: null, reviewedBy: null, reviewedAt: null, sourcesCount: 0 }
      : null,
  };

  const { data: relatedRows } = await db
    .from("published_articles")
    .select(PUBLIC_COLUMNS)
    .eq("category_slug", article.categorySlug)
    .neq("slug", slug)
    .order("publish_at", { ascending: false })
    .limit(3);

  return {
    article,
    related: ((relatedRows ?? []) as unknown as PublicRow[]).map(rowToCard),
    isDemoData: false,
  };
}

export async function listArticleSlugs(limit = 1000): Promise<{ slug: string; publishAt: string | null }[]> {
  const mode = assertReadable();
  if (mode === "unavailable") return [];
  if (mode === "demo") {
    return demoHomePage().latest.map((c) => ({ slug: c.slug, publishAt: c.publishedAt }));
  }
  const db = supabase();
  if (!db) return [];
  const { data, error } = await db
    .from("published_articles")
    .select("slug,publish_at")
    .order("publish_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Failed to list slugs: ${error.message}`);
  return (data ?? []).map((r) => ({
    slug: (r as { slug: string }).slug,
    publishAt: (r as { publish_at: string | null }).publish_at,
  }));
}
