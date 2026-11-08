import { htmlToText } from "@/server/content/sanitize";

/** Average adult reading speed for news prose, words per minute. */
const WORDS_PER_MINUTE = 225;

/**
 * Estimates reading time from sanitised text content.
 * Bounded to the same range the database enforces (1–180) so a CHECK constraint can never
 * reject a row because of a computed value.
 */
export function readingTimeMinutes(html: string, wpm = WORDS_PER_MINUTE): number {
  const text = htmlToText(html, Number.MAX_SAFE_INTEGER);
  const words = text.length === 0 ? 0 : text.split(/\s+/).filter(Boolean).length;
  const minutes = Math.ceil(words / wpm);
  if (!Number.isFinite(minutes) || minutes < 1) return 1;
  return Math.min(minutes, 180);
}

export function wordCount(html: string): number {
  const text = htmlToText(html, Number.MAX_SAFE_INTEGER);
  return text.length === 0 ? 0 : text.split(/\s+/).filter(Boolean).length;
}
