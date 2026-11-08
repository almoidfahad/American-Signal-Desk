import type { MetadataRoute } from "next";
import { DEMO_CATEGORIES } from "@/server/content/demo";
import { getCategories, listArticleSlugs } from "@/server/content/repository";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/**
 * XML sitemap.
 *
 * Only published articles are listed. In demo/unconfigured mode the sitemap contains
 * static pages and categories only — never synthetic article URLs, which would be a
 * soft-404 signal to crawlers.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: "hourly", priority: 1 },
    { url: `${SITE_URL}/about`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/contact`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/advertise`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/newsletter`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/editorial-standards`, changeFrequency: "yearly", priority: 0.4 },
    { url: `${SITE_URL}/corrections`, changeFrequency: "weekly", priority: 0.4 },
    { url: `${SITE_URL}/privacy`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE_URL}/terms`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE_URL}/cookies`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE_URL}/disclaimer`, changeFrequency: "yearly", priority: 0.2 },
  ];

  let categories = DEMO_CATEGORIES;
  let articles: { slug: string; publishAt: string | null }[] = [];

  try {
    categories = await getCategories();
    articles = await listArticleSlugs(1000);
  } catch (error) {
    // Sitemap generation must never break the build; log and ship static routes.
    console.error("[sitemap] falling back to static routes", error);
  }

  const categoryRoutes: MetadataRoute.Sitemap = categories.map((c) => ({
    url: `${SITE_URL}/category/${c.slug}`,
    changeFrequency: "hourly",
    priority: 0.7,
  }));

  const articleRoutes: MetadataRoute.Sitemap = articles
    .filter((a) => a.slug !== "")
    .map((a) => ({
      url: `${SITE_URL}/article/${a.slug}`,
      lastModified: a.publishAt ? new Date(a.publishAt) : undefined,
      changeFrequency: "daily",
      priority: 0.9,
    }));

  return [...staticRoutes, ...categoryRoutes, ...articleRoutes];
}
