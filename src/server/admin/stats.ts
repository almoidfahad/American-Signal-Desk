/**
 * Admin dashboard metrics.
 *
 * Hard rule: never invent numbers. If the database is not reachable, every metric is
 * returned as `null` with an explicit `unavailable` status, and the UI renders "—" plus a
 * reason. A dashboard that shows plausible-looking fake traffic is worse than one that
 * admits it has no data.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { contentMode } from "@/server/content/repository";

export type MetricStatus = "live" | "unavailable";

export interface Metric {
  key: string;
  label: string;
  /** null = no verified value. Rendered as an em dash, never as 0. */
  value: number | null;
  status: MetricStatus;
  /** Why the value is missing, shown to the operator. */
  note?: string;
  format?: "number" | "currency";
}

export interface DashboardStats {
  status: MetricStatus;
  reason?: string;
  metrics: Metric[];
  recentArticles: {
    title: string;
    category: string;
    status: string;
    updatedAt: string | null;
  }[];
  systemChecks: { label: string; state: "ok" | "degraded" | "unknown"; detail: string }[];
}

function metric(
  key: string,
  label: string,
  value: number | null,
  status: MetricStatus,
  extra: Partial<Metric> = {},
): Metric {
  return { key, label, value, status, ...extra };
}

function serviceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Honest, unfaked service checks derived from configuration presence only. */
function systemChecks(): DashboardStats["systemChecks"] {
  const checks: DashboardStats["systemChecks"] = [];
  const hasDb = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  checks.push({
    label: "Database (PostgreSQL)",
    state: hasDb ? "ok" : "unknown",
    detail: hasDb ? "Service credentials present" : "No Supabase credentials configured",
  });

  const hasRedis = Boolean(process.env.REDIS_URL);
  checks.push({
    label: "Redis / job queue",
    state: hasRedis ? "ok" : "unknown",
    detail: hasRedis ? "REDIS_URL present — worker connectivity not yet probed" : "REDIS_URL not set",
  });

  checks.push({
    label: "AI provider",
    state: process.env.AI_PROVIDER_API_KEY ? "ok" : "unknown",
    detail: process.env.AI_PROVIDER_API_KEY ? "Key present" : "AI_PROVIDER_API_KEY not set",
  });

  checks.push({
    label: "Payment provider",
    state: process.env.PAYMENT_PROVIDER_SECRET ? "ok" : "unknown",
    detail: process.env.PAYMENT_PROVIDER_SECRET ? "Key present" : "PAYMENT_PROVIDER_SECRET not set",
  });

  return checks;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const checks = systemChecks();
  const db = serviceClient();

  if (!db) {
    const note =
      contentMode() === "demo"
        ? "Sample mode: no database is configured, so there are no verified metrics to show."
        : "Database is not configured.";
    return {
      status: "unavailable",
      reason: note,
      metrics: [
        metric("articles", "Total Articles", null, "unavailable", { note }),
        metric("visitors", "Total Visitors", null, "unavailable", {
          note: "Analytics provider is not configured.",
        }),
        metric("subscribers", "Newsletter Subscribers", null, "unavailable", { note }),
        metric("pageviews", "Total Page Views", null, "unavailable", {
          note: "Analytics provider is not configured.",
        }),
        metric("revenue", "Ad Revenue (Est.)", null, "unavailable", {
          note: "Advertising provider is not configured.",
          format: "currency",
        }),
      ],
      recentArticles: [],
      systemChecks: checks,
    };
  }

  /**
   * Live mode: real counts. `head: true` avoids transferring any rows.
   * A failed count returns null (rendered as "—"), never 0 — a silent zero would look
   * like a real measurement of an empty newsroom.
   */
  const countOf = async (
    table: string,
    status?: string,
  ): Promise<number | null> => {
    let query = db.from(table).select("*", { count: "exact", head: true });
    if (status) query = query.eq("status", status);
    const { count, error } = await query;
    if (error) {
      console.error(`[admin-stats] count failed for ${table}: ${error.message}`);
      return null;
    }
    return count ?? 0;
  };

  const [articles, subscribers, published, drafts, pending] = await Promise.all([
    countOf("articles"),
    countOf("newsletter_subscriptions"),
    countOf("articles", "published"),
    countOf("articles", "draft"),
    countOf("articles", "pending_review"),
  ]);

  const { data: recent } = await db
    .from("articles")
    .select("title,category_name,status,updated_at")
    .order("updated_at", { ascending: false })
    .limit(5);

  return {
    status: "live",
    metrics: [
      metric("articles", "Total Articles", articles, articles === null ? "unavailable" : "live"),
      metric("published", "Published", published, published === null ? "unavailable" : "live"),
      metric("drafts", "Drafts", drafts, drafts === null ? "unavailable" : "live"),
      metric(
        "pending",
        "Awaiting Review",
        pending,
        pending === null ? "unavailable" : "live",
      ),
      metric(
        "subscribers",
        "Newsletter Subscribers",
        subscribers,
        subscribers === null ? "unavailable" : "live",
      ),
    ],
    recentArticles: (recent ?? []).map((r) => ({
      title: (r.title as string) ?? "",
      category: (r.category_name as string | null) ?? "—",
      status: (r.status as string) ?? "draft",
      updatedAt: (r.updated_at as string | null) ?? null,
    })),
    systemChecks: checks,
  };
}
