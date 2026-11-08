import { z } from "zod";

/**
 * Safe HTTP(S) URL validation.
 *
 * Why this exists: Zod's `z.string().url()` uses the WHATWG URL parser, which happily
 * accepts `javascript:alert(1)` and `data:text/html,...` because they are syntactically
 * valid URLs. Verified against zod 4.6.7 — do not "simplify" this back to `.url()`.
 *
 * A URL that reaches an `href` or `src` attribute must be limited to http/https, or it
 * becomes an injection primitive. Only schemes are rejected here; the sanitiser handles
 * HTML-level attacks separately.
 */
const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

export const httpUrlSchema = z
  .string()
  .trim()
  .max(2048, "URL খুব বড়।")
  .refine((value) => {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      return false;
    }
    if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) return false;
    // Reject credentials in the URL: https://user:pass@host leaks secrets into logs.
    if (parsed.username || parsed.password) return false;
    // A bare host with no path is fine, but the host must be non-empty.
    return parsed.hostname.length > 0;
  }, "শুধুমাত্র http:// অথবা https:// লিংক ব্যবহার করুন।");

/** Optional variant for nullable columns. */
export const optionalHttpUrlSchema = httpUrlSchema.nullish();

export function isSafeHttpUrl(value: string): boolean {
  return httpUrlSchema.safeParse(value).success;
}
