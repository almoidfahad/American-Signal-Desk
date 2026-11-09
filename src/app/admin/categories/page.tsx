import type { Metadata } from "next";
import Link from "next/link";
import { Badge, DataTable, PageHeader, Panel, TableEmpty } from "@/components/admin/ui";
import { ListUnavailable } from "@/components/admin/list-states";
import { requireAdminPage } from "@/server/admin/guard";
import { listCategories, NOT_CONFIGURED_ENV } from "@/server/admin/queries";

export const metadata: Metadata = { title: "Categories" };
export const dynamic = "force-dynamic";

/**
 * Sections the newsroom publishes into.
 *
 * Read-only in this build. Writing sections would need a mutation path with its own
 * permission (`category.manage`), audit entry and cache invalidation, and half of that is
 * not implemented - so this page does not show an "Add section" button that does nothing.
 * Saying so in the page body is more useful to an operator than a dead control.
 */
export default async function CategoriesPage() {
  const access = await requireAdminPage("category.manage");
  if (!access.ok) return access.node;

  const result = await listCategories();
  const rows = result.ok ? result.data : [];

  return (
    <div>
      <PageHeader
        title="Categories"
        description="The sections articles are filed under, in the order they appear on the public site."
        actions={
          <span className="rounded-md border border-navy-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-navy-700">
            {result.ok ? `${rows.length} section${rows.length === 1 ? "" : "s"}` : "Count unavailable"}
          </span>
        }
      />

      <Panel
        title="All sections"
        bodyClassName=""
        action={
          <span className="text-[11px] font-semibold text-navy-500">Read-only in this build</span>
        }
      >
        {!result.ok ? (
          <div className="p-4">
            <ListUnavailable
              feature="Category list"
              requiredEnv={NOT_CONFIGURED_ENV}
              result={result}
              detail="Sections are read from the database. With no database configured there is nothing to show - and no seeded placeholder list is drawn in its place."
            />
          </div>
        ) : (
          <DataTable
            caption="All newsroom sections"
            head={
              <>
                <th scope="col" className="px-4 py-2.5">
                  Name
                </th>
                <th scope="col" className="px-4 py-2.5">
                  Slug
                </th>
                <th scope="col" className="px-4 py-2.5">
                  Articles
                </th>
                <th scope="col" className="px-4 py-2.5">
                  Order
                </th>
                <th scope="col" className="px-4 py-2.5">
                  Status
                </th>
                <th scope="col" className="px-4 py-2.5 text-right">
                  <span className="sr-only">Actions</span>
                </th>
              </>
            }
          >
            {rows.length === 0 ? (
              <TableEmpty colSpan={6}>
                No sections exist yet. Seed the categories table before publishing.
              </TableEmpty>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="hover:bg-navy-50/60">
                  <td className="px-4 py-2.5">
                    <span className="font-semibold text-navy-900">{row.name}</span>
                    {row.description && (
                      <p className="mt-0.5 line-clamp-1 max-w-[320px] text-[11.5px] text-navy-500">
                        {row.description}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[11px] text-navy-500">{row.slug}</td>
                  <td className="px-4 py-2.5 text-navy-700 tabular">
                    {row.articleCount === null ? (
                      <span title="The count query failed">-</span>
                    ) : (
                      row.articleCount
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-navy-500 tabular">{row.sortOrder}</td>
                  <td className="px-4 py-2.5">
                    <Badge tone={row.isActive ? "green" : "slate"}>
                      {row.isActive ? "Active" : "Hidden"}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Link
                      href={`/admin/articles?category=${row.slug}`}
                      className="text-[11.5px] font-bold text-signal-700 hover:underline"
                    >
                      View articles
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </DataTable>
        )}
      </Panel>
    </div>
  );
}
