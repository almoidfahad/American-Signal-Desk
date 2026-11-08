import { createClient } from "@supabase/supabase-js";
import type { TickerItem } from "@/components/site/breaking-ticker";

/**
 * Breaking news ticker data.
 *
 * Returns an empty array when nothing is active — the ticker hides itself rather than
 * showing invented headlines. Only `is_active` rows inside their display window are read.
 */
export async function getBreakingNews(): Promise<TickerItem[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return [];

  try {
    const db = createClient(url, key, { auth: { persistSession: false } });
    const nowIso = new Date().toISOString();
    const { data, error } = await db
      .from("breaking_news")
      .select("id,headline,href,starts_at,ends_at,is_active")
      .eq("is_active", true)
      .lte("starts_at", nowIso)
      .order("started_at", { ascending: false })
      .limit(5);

    if (error) {
      // Degrade gracefully: a ticker outage must never take down the homepage.
      console.error(`[breaking-news] query failed: ${error.message}`);
      return [];
    }

    return (data ?? [])
      .filter((r) => !r.ends_at || (r.ends_at as string) > nowIso)
      .map((r) => ({ id: String(r.id), headline: r.headline as string, href: (r.href as string) ?? "/" }));
  } catch (error) {
    console.error("[breaking-news] unavailable", error);
    return [];
  }
}
