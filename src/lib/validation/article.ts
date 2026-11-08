import { z } from "zod";
import { httpUrlSchema } from "@/lib/validation/url";

/**
 * Article input validation, shared by the editor UI and the service layer.
 *
 * Notes on deliberate choices:
 *  - `slug` is validated strictly at the boundary. A slug is a public URL, so it must be
 *    predictable and cannot be used to smuggle path segments or query characters.
 *  - `bodyHtml` is *not* sanitised here. Validation and sanitisation are different jobs:
 *    we store what the editor wrote and sanitise on render, so the stored revision remains
 *    the author's actual text (important for corrections and revision history).
 *  - Lengths are bounded so a single request cannot exhaust storage.
 */

const slug = z
  .string()
  .trim()
  .min(3, "স্লাগ অন্তত ৩ অক্ষরের হতে হবে।")
  .max(120, "স্লাগ খুব বড়।")
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "স্লাগে শুধু ছোট হাতের অক্ষর, সংখ্যা ও হাইফেন ব্যবহার করুন।")
  // Reserved prefixes would collide with real application routes.
  .refine((v) => !["admin", "api", "auth", "_next", "sitemap", "robots"].includes(v.split("-")[0] ?? ""), {
    message: "এই স্লাগটি সংরক্ষিত শব্দের সাথে মিলে যায়।",
  });

export const articleInputSchema = z.object({
  title: z
    .string()
    .trim()
    .min(5, "শিরোনাম অন্তত ৫ অক্ষরের হতে হবে।")
    .max(300, "শিরোনাম ৩০০ অক্ষরের বেশি হতে পারবে না।"),
  slug,
  dek: z.string().trim().max(400, "সারসংক্ষেপ ৪০০ অক্ষরের বেশি হতে পারবে না।").default(""),
  bodyHtml: z
    .string()
    .max(500_000, "লেখার আকার অনুমোদিত সীমার বেশি।")
    .default(""),
  categoryId: z.string().uuid("বিভাগ সঠিক নয়।").nullish(),
  // Must be http(s): Zod's bare .url() accepts javascript: and data: schemes.
  heroImageUrl: httpUrlSchema.nullish(),
  heroImageAlt: z.string().trim().max(300).nullish(),
});

export type ArticleInput = z.infer<typeof articleInputSchema>;

export const transitionInputSchema = z.object({
  id: z.string().uuid("লেখার আইডি সঠিক নয়।"),
  to: z.enum([
    "draft",
    "pending_review",
    "changes_requested",
    "approved",
    "scheduled",
    "published",
    "rejected",
    "archived",
    "trash",
  ]),
  note: z.string().trim().max(1000).optional(),
});

export type TransitionInput = z.infer<typeof transitionInputSchema>;

/** Derives a URL-safe slug from a title. Does not guarantee uniqueness. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    // Keep ASCII letters/digits; everything else becomes a separator.
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
}
