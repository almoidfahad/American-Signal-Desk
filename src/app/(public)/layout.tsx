import { SiteFooter } from "@/components/site/footer";
import { SiteHeader } from "@/components/site/header";
import { BreakingTicker, type TickerItem } from "@/components/site/breaking-ticker";
import { getBreakingNews } from "@/server/content/breaking";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const items: TickerItem[] = await getBreakingNews();

  return (
    <>
      <SiteHeader />
      <BreakingTicker items={items} />
      <div id="main" role="main" className="mx-auto max-w-[1560px] px-4 py-6 sm:px-6">
        {children}
      </div>
      <SiteFooter />
    </>
  );
}
