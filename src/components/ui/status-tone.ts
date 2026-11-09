import type { StatusTone } from "@/components/ui/styles";
import type { BadgeTone } from "@/components/admin/ui";

/**
 * Maps an article status to a badge tone.
 *
 * Colour never carries the meaning alone — every caller also renders the status text, so a
 * reader who cannot distinguish the colours (or is using high contrast) still gets the state.
 */
export function statusTone(status: string): BadgeTone {
  switch (status) {
    case "published":
      return "green";
    case "pending_review":
    case "changes_requested":
    case "scheduled":
      return "amber";
    case "rejected":
    case "trash":
      return "red";
    case "approved":
      return "navy";
    default:
      return "slate";
  }
}

/** Re-exported for callers that want the ring-based pill from the shared styles module. */
export type { StatusTone };
