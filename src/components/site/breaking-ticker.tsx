"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

export interface TickerItem {
  id: string;
  headline: string;
  href: string;
}

/**
 * Breaking-news ticker.
 *
 * Accessibility decisions, deliberately made against the usual marquee:
 *   - no automatic scrolling. A bar that moves on its own is hard to read, impossible to
 *     pause with a keyboard, and a vestibular-trigger hazard. Instead the reader steps
 *     through items with real buttons.
 *   - it is a labelled region with an aria-live="polite" announcement, so a screen reader
 *     hears "Breaking news" once rather than on every rotation.
 *   - when there is no breaking news it renders nothing. It never invents a headline to
 *     fill the bar.
 */
export function BreakingTicker({ items }: { items: TickerItem[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const regionRef = useRef<HTMLElement | null>(null);

  const count = items.length;

  const step = useCallback(
    (delta: number) => {
      if (count === 0) return;
      setIndex((current) => (current + delta + count) % count);
    },
    [count],
  );

  // Advance only while the pointer is not over the bar and the page is visible.
  useEffect(() => {
    if (count < 2 || paused) return;
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;

    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        setIndex((current) => (current + 1) % count);
      }
    }, 7000);
    return () => window.clearInterval(timer);
  }, [count, paused]);

  if (count === 0) return null;

  const current = items[index];
  if (!current) return null;

  return (
    <section
      ref={regionRef}
      aria-label="Breaking news"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="bg-signal-700 text-white on-dark"
    >
      <div className="shell flex items-center gap-3 py-2">
        <p className="flex shrink-0 items-center gap-2 text-[11px] font-extrabold tracking-[0.14em] uppercase">
          <span aria-hidden="true" className="live-dot" />
          Breaking News
        </p>

        <span aria-hidden="true" className="hidden h-4 w-px bg-white/40 sm:block" />

        <div className="min-w-0 flex-1" aria-live="polite" aria-atomic="true">
          <Link
            href={current.href}
            className="block truncate text-[13px] font-semibold hover:underline sm:text-sm"
          >
            {current.headline}
          </Link>
        </div>

        {count > 1 && (
          <div className="flex shrink-0 items-center gap-1">
            <span className="sr-only">
              Story {index + 1} of {count}
            </span>
            <button
              type="button"
              onClick={() => step(-1)}
              className="flex h-7 w-7 items-center justify-center rounded hover:bg-white/15"
            >
              <span aria-hidden="true">&lsaquo;</span>
              <span className="sr-only">Previous breaking story</span>
            </button>
            <button
              type="button"
              onClick={() => step(1)}
              className="flex h-7 w-7 items-center justify-center rounded hover:bg-white/15"
            >
              <span aria-hidden="true">&rsaquo;</span>
              <span className="sr-only">Next breaking story</span>
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
