import { formatNewsroom } from "@/lib/dates";
import type { Metadata } from "next";
import { Badge, DataTable, PageHeader, Panel, TableEmpty } from "@/components/admin/ui";
import { ListUnavailable } from "@/components/admin/list-states";
import { requireAdminPage } from "@/server/admin/guard";
import { listMedia, NOT_CONFIGURED_ENV } from "@/server/admin/queries";

export const metadata: Metadata = { title: "Media Library" };
export const dynamic = "force-dynamic";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Media library, read side.
 *
 * There is no upload control here. Upload needs a storage bucket, a signed-URL flow and the
 * `media.upload` permission checked against a real file - none of which exist in this build.
 * A disabled button would suggest it is a permissions problem; the panel says what is
 * actually missing instead.
 *
 * Alt text is displayed as a column rather than hidden in a detail view, because the schema
 * makes it mandatory and a reviewer should be able to see at a glance that it is there.
 */
export default async function MediaPage() {
  const access = await requireAdminPage("media.upload");
  if (!access.ok) return access.node;

  // Any editor who can attach an image can read the library, even without upload rights.
  const result = await listMedia();
  const rows = result.ok ? result.data : [];
  const totalBytes = rows.reduce((sum, row) => sum + row.byteSize, 0);

  return (
    <div>
      <PageHeader
        title="Media Library"
        description="Images available to articles, with the alt text readers depend on."
        actions={
          <span className="rounded-md border border-navy-200 bg-white px-3 py-1.5 text-caption font-semibold text-navy-700">
            {result.ok
              ? `${rows.length} asset${rows.length === 1 ? "" : "s"} - ${formatBytes(totalBytes)}`
              : "Count unavailable"}
          </span>
        }
      />

      <div className="mb-4 rounded-md bg-amber-50 px-4 py-3 text-small leading-relaxed text-amber-900 ring-1 ring-amber-300">
        <p className="font-bold">Uploads are not implemented in this build</p>
        <p className="mt-1">
          The library is read from the <span className="font-mono text-caption">media_assets</span>{" "}
          table, but there is no storage bucket configured and no upload flow yet. Records can
          only appear here if they were written directly to the database. No upload button is
          shown, because it would fail and the failure would look like a permissions problem.
        </p>
      </div>

      <Panel title="Assets" bodyClassName="">
        {!result.ok ? (
          <div className="p-4">
            <ListUnavailable
              feature="Media library"
              requiredEnv={NOT_CONFIGURED_ENV}
              result={result}
              detail="The library is read from the database. Nothing is substituted for it when the database is absent."
            />
          </div>
        ) : (
          <DataTable
            caption="Media assets"
            head={
              <>
                <th scope="col" className="px-4 py-2.5">
                  File
                </th>
                <th scope="col" className="px-4 py-2.5">
                  Alt text
                </th>
                <th scope="col" className="px-4 py-2.5">
                  Type
                </th>
                <th scope="col" className="px-4 py-2.5">
                  Size
                </th>
                <th scope="col" className="px-4 py-2.5">
                  Dimensions
                </th>
                <th scope="col" className="px-4 py-2.5">
                  Added
                </th>
              </>
            }
          >
            {rows.length === 0 ? (
              <TableEmpty colSpan={6}>
                No assets yet. Nothing has been recorded in the media table.
              </TableEmpty>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="hover:bg-navy-50/60">
                  <td className="max-w-[220px] px-4 py-2.5">
                    <span className="block truncate font-semibold text-navy-900">{row.fileName}</span>
                    <span className="block truncate font-mono text-micro text-navy-400">
                      {row.storagePath}
                    </span>
                  </td>
                  <td className="max-w-[280px] px-4 py-2.5">
                    <span className="line-clamp-2 text-caption text-navy-700">{row.altText}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge tone="slate">{row.mimeType.replace("image/", "").toUpperCase()}</Badge>
                  </td>
                  <td className="px-4 py-2.5 text-navy-600 tabular">{formatBytes(row.byteSize)}</td>
                  <td className="px-4 py-2.5 text-navy-500 tabular">
                    {row.width && row.height ? `${row.width} x ${row.height}` : "-"}
                  </td>
                  <td className="px-4 py-2.5 text-caption text-navy-500 tabular">
                    {formatNewsroom(row.createdAt)}
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
