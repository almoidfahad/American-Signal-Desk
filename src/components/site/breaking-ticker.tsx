import Link from "next/link";

export interface TickerItem {
  id: string;
  headline: string;
  href: string;
}

/**
 * Breaking-news ticker.
 *
 * Server-rendered with no marquee animation: an auto-scrolling bar is an accessibility
 * hazard and cannot be paused easily. Instead the latest item leads and the rest are
 * reachable by scrolling, with a labelled landmark.
 *
 * When there is no real breaking news, this component renders nothing rather than
 * inventing headlines.
 */
export function BreakingTicker({ items }: { items: TickerItem[] }) {
  if (items.length === 0) return null;
  const [lead, ...rest] = items;
  if (!lead) return null;

  return (
    <section aria-label="Breaking news" className="bg-signal-700 text-white">
      <div className="mx-auto flex max-w-[1560px] items-center gap-4 px-4 py-2.5 sm:px-6">
        <span className="flex shrink-0 items-center gap-1.5 text-xs font-bold tracking-widest uppercase">
          <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full bg-white" />
          Breaking News
        </span>
        <div className="min-w-0 flex-1 overflow-x-auto">
          <ul className="flex items-center gap-6 text-sm whitespace-nowrap">
            {[lead, ...rest].map((item) => (
              <li key={item.id}>
                <Link href={item.href} className="hover:underline">
                  {item.headline}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
