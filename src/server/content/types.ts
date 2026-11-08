/** Public-facing view models. Shaped for rendering, not for the database. */

export interface Category {
  slug: string;
  name: string;
  description: string;
}

export interface AuthorSummary {
  slug: string;
  name: string;
  role: string;
  bio: string;
}

export interface ArticleCard {
  slug: string;
  title: string;
  dek: string;
  categorySlug: string;
  categoryName: string;
  /** ISO-8601. Always UTC in storage; formatted for display at the edge. */
  publishedAt: string | null;
  readingMinutes: number;
  imageUrl: string | null;
  imageAlt: string;
  author: AuthorSummary | null;
  isExclusive?: boolean;
  isAiAssisted?: boolean;
}

export interface Article extends ArticleCard {
  bodyHtml: string;
  updatedAt: string | null;
  tags: string[];
  /** Provenance record. Present whenever an agent contributed to the draft. */
  aiProvenance: AiProvenance | null;
}

/**
 * Editorial transparency: if AI assisted, the reader is told, and the human who
 * approved publication is on the record.
 */
export interface AiProvenance {
  assisted: boolean;
  model: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  sourcesCount: number;
}

export interface HomePageData {
  lead: ArticleCard;
  secondary: ArticleCard[];
  latest: ArticleCard[];
  editorsPicks: ArticleCard[];
  mostRead: { title: string; slug: string }[];
  categories: Category[];
  /**
   * True only when this data is development-only sample content.
   * The UI must render a visible banner when true.
   */
  isDemoData: boolean;
  /**
   * True when the content source is not configured in a production build. The UI renders a
   * truthful service notice — it never substitutes sample stories for real ones.
   */
  isUnavailable?: boolean;
}

export interface ArticlePageData {
  article: Article;
  related: ArticleCard[];
  isDemoData: boolean;
}
