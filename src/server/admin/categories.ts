import { serviceClient } from "@/server/db/client";
/**
 * Category list for the admin editor.
 *
 * The public `getCategories()` returns slugs (that is all a reader needs). The editor must
 * submit a real UUID for `articles.category_id`, so this returns id + name.
 *
 * Bug this fixes: the editor form previously sent the slug as `categoryId`, which the
 * UUID validator correctly rejected — so choosing a category would have failed on save.
 */

export interface AdminCategory {
  id: string;
  name: string;
  slug: string;
}

export async function listCategoriesForAdmin(): Promise<AdminCategory[]> {
  const db = serviceClient();
  if (!db) return [];
  const { data, error } = await db
    .from("categories")
    .select("id,name,slug")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) {
    // Missing categories must not block writing an article; the field is optional.
    console.error(`[admin-categories] ${error.message}`);
    return [];
  }
  return (data ?? []) as AdminCategory[];
}
