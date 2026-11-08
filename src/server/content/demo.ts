/**
 * Development-only sample content.
 *
 * This file exists so the UI can be reviewed before a database is provisioned.
 * Every value here is synthetic. It is only ever returned when:
 *   1. Supabase is not configured, AND
 *   2. we are not running a production build.
 * In production the content layer throws instead of inventing news — see repository.ts.
 */
import type { Article, ArticleCard, Category, HomePageData } from "./types";

export const DEMO_CATEGORIES: Category[] = [
  { slug: "us-news", name: "U.S. News", description: "National affairs and policy." },
  { slug: "politics", name: "Politics", description: "Campaigns, Congress and the White House." },
  { slug: "world", name: "World", description: "International reporting." },
  { slug: "business", name: "Business", description: "Markets, companies and the economy." },
  { slug: "technology", name: "Technology", description: "Innovation and digital policy." },
  { slug: "health", name: "Health", description: "Public health and medicine." },
  { slug: "science", name: "Science", description: "Research and discovery." },
  { slug: "sports", name: "Sports", description: "Scores, leagues and the people behind them." },
  { slug: "entertainment", name: "Entertainment", description: "Culture and media." },
  { slug: "opinion", name: "Opinion", description: "Analysis and argument." },
];

const DEMO_AUTHOR = {
  slug: "demo-newsroom",
  name: "ASD Sample Newsroom",
  role: "Placeholder author",
  bio: "This author record is synthetic sample data used to preview the interface before the editorial database is connected.",
};

const ISO = "2026-11-08T14:00:00.000Z";

export const DEMO_ARTICLES: Article[] = [
  {
    slug: "sample-white-house-economic-plan",
    title: "White House Unveils New Economic Plan for 2027",
    dek: "Sample copy only. This article demonstrates the layout and is replaced by real editorial content once the CMS is connected.",
    bodyHtml:
      "<p><strong>Sample content.</strong> This paragraph exists so the article template can be reviewed end to end — typography, measure, and spacing — before the newsroom database is provisioned.</p>" +
      "<h2>What this placeholder demonstrates</h2>" +
      "<p>Headings, paragraphs, lists and pull quotes all render from sanitised HTML produced by the editorial pipeline. The real system stores an immutable revision trail for every one of these elements.</p>" +
      "<ul><li>Article card and lead story layouts</li><li>Category and author attribution</li><li>Reading-time estimation</li></ul>" +
      "<blockquote>No synthetic article on this site is presented as real reporting.</blockquote>" +
      "<p>When the database is connected, this page reads only rows marked as published, with a publish timestamp in the past.</p>",
    categorySlug: "us-news",
    categoryName: "U.S. News",
    publishedAt: ISO,
    updatedAt: ISO,
    readingMinutes: 5,
    imageUrl: null,
    imageAlt: "Illustration placeholder for the lead story layout",
    author: DEMO_AUTHOR,
    tags: ["sample", "layout"],
    isExclusive: true,
    isAiAssisted: false,
    aiProvenance: null,
  },
  {
    slug: "sample-markets-close-higher",
    title: "Markets Close Higher as Technology Shares Rally",
    dek: "Placeholder article showing the secondary card treatment.",
    bodyHtml: "<p><strong>Sample content.</strong> Placeholder body.</p>",
    categorySlug: "business",
    categoryName: "Business",
    publishedAt: ISO,
    updatedAt: null,
    readingMinutes: 2,
    imageUrl: null,
    imageAlt: "Placeholder image for markets article",
    author: DEMO_AUTHOR,
    tags: ["sample"],
    isAiAssisted: true,
    aiProvenance: {
      assisted: true,
      model: "sample-model",
      reviewedBy: "ASD Sample Editor",
      reviewedAt: ISO,
      sourcesCount: 3,
    },
  },
  {
    slug: "sample-healthcare-coverage",
    title: "New Healthcare Initiative to Expand Coverage",
    dek: "Placeholder article about a healthcare policy proposal.",
    bodyHtml: "<p><strong>Sample content.</strong> Placeholder body.</p>",
    categorySlug: "health",
    categoryName: "Health",
    publishedAt: ISO,
    updatedAt: null,
    readingMinutes: 3,
    imageUrl: null,
    imageAlt: "Placeholder image for healthcare article",
    author: DEMO_AUTHOR,
    tags: ["sample"],
    aiProvenance: null,
  },
  {
    slug: "sample-space-mission",
    title: "NASA Advances Next-Generation Space Mission",
    dek: "Placeholder article describing a science brief.",
    bodyHtml: "<p><strong>Sample content.</strong> Placeholder body.</p>",
    categorySlug: "science",
    categoryName: "Science",
    publishedAt: ISO,
    updatedAt: null,
    readingMinutes: 4,
    imageUrl: null,
    imageAlt: "Placeholder image for space mission article",
    author: DEMO_AUTHOR,
    tags: ["sample"],
    aiProvenance: null,
  },
  {
    slug: "sample-cities-greener",
    title: "Cities Build a Greener Tomorrow",
    dek: "Placeholder article about municipal climate planning.",
    bodyHtml: "<p><strong>Sample content.</strong> Placeholder body.</p>",
    categorySlug: "world",
    categoryName: "World",
    publishedAt: "2026-11-07T12:00:00.000Z",
    updatedAt: null,
    readingMinutes: 4,
    imageUrl: null,
    imageAlt: "Placeholder image for cities article",
    author: DEMO_AUTHOR,
    tags: ["sample"],
    aiProvenance: null,
  },
  {
    slug: "sample-ai-revolution",
    title: "The AI Revolution Accelerates",
    dek: "Placeholder technology analysis.",
    bodyHtml: "<p><strong>Sample content.</strong> Placeholder body.</p>",
    categorySlug: "technology",
    categoryName: "Technology",
    publishedAt: "2026-11-07T09:00:00.000Z",
    updatedAt: null,
    readingMinutes: 6,
    imageUrl: null,
    imageAlt: "Placeholder image for AI article",
    author: DEMO_AUTHOR,
    tags: ["sample"],
    aiProvenance: null,
  },
  {
    slug: "sample-sports-highlights",
    title: "Sports Highlights of the Week",
    dek: "Placeholder sports roundup.",
    bodyHtml: "<p><strong>Sample content.</strong> Placeholder body.</p>",
    categorySlug: "sports",
    categoryName: "Sports",
    publishedAt: "2026-11-06T18:00:00.000Z",
    updatedAt: null,
    readingMinutes: 3,
    imageUrl: null,
    imageAlt: "Placeholder image for sports article",
    author: DEMO_AUTHOR,
    tags: ["sample"],
    aiProvenance: null,
  },
  {
    slug: "sample-opinion-federalism",
    title: "Opinion: Federalism Deserves a Serious Debate",
    dek: "Placeholder opinion column, clearly labelled as opinion.",
    bodyHtml: "<p><strong>Sample content.</strong> Placeholder opinion body.</p>",
    categorySlug: "opinion",
    categoryName: "Opinion",
    publishedAt: "2026-11-06T10:00:00.000Z",
    updatedAt: null,
    readingMinutes: 5,
    imageUrl: null,
    imageAlt: "Placeholder image for opinion column",
    author: DEMO_AUTHOR,
    tags: ["sample", "opinion"],
    aiProvenance: null,
  },
];

function toCard(article: Article): ArticleCard {
  const { bodyHtml: _bodyHtml, tags: _tags, aiProvenance: _p, ...card } = article;
  return card;
}

export function demoHomePage(): HomePageData {
  const cards = DEMO_ARTICLES.map(toCard);
  const [lead, ...rest] = cards;
  if (!lead) throw new Error("Demo content is empty");
  return {
    lead,
    secondary: rest.slice(0, 3),
    latest: cards.slice(1),
    editorsPicks: cards.slice(4, 8),
    mostRead: cards.slice(0, 5).map((a) => ({ title: a.title, slug: a.slug })),
    categories: DEMO_CATEGORIES,
    isDemoData: true,
    isUnavailable: false,
  };
}

export function demoArticle(slug: string): Article | null {
  return DEMO_ARTICLES.find((a) => a.slug === slug) ?? null;
}
