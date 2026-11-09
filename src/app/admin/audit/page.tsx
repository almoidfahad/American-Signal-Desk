import type { Metadata } from "next";
import { Badge, DataTable, PageHeader, Panel, TableEmpty } from "@/components/admin/ui";
import { ListUnavailable } from "@/components/admin/list-states";
import { requireAdminPage } from "@/server/admin/guard";
import { listAuditLog, NOT_CONFIGURED_ENV } from "@/server/admin/queries";

export const metadata: Metadata = { title: "Audit Logs" };
export const dynamic = "force-dynamic";

/**
 * The audit trail.
 *
 * The table is append-only in the database (no UPDATE/DELETE policy, plus a blocking
 * trigger), which is why this page has no edit or delete affordance: the reader is looking
 * at a record that cannot be altered, and the UI should not imply otherwise.
 *
 * Denied attempts are shown alongside successes. An audit log that only records what worked
 * is a marketing document, not a security control.
 */
export default async function AuditPage() {
  const access = await requireAdminPage("audit.read");
  if (!access.ok) return access.node;

  const result = await listAuditLog();
  const rows = result.ok ? result.data : [];
  const denied = rows.filter((row) => row.outcome === "denied").length;

  return (
    <div>
      <PageHeader
        title="Audit Logs"
        description="Every privileged action and refused attempt, newest first. Append-only: rows cannot be edited or deleted."
        actions={
          <span className="rounded-md border border-navy-200 bg-white px-3 py-1.5 text-caption font-semibold text-navy-700">
            {result.ok ? `${rows.length} recent entr${rows.length === 1 ? "y" : "ies"}` : "Unavailable"}
          </span>
        }
      />

      {result.ok && denied > 0 && (
        <div className="mb-4 rounded-md bg-signal-50 px-4 py-3 text-small text-signal-900 ring-1 ring-signal-300">
          <span className="font-bold">
            {denied} refused attempt{denied === 1 ? "" : "s"} in this window.
          </span>{" "}
          A refused attempt means someone reached an endpoint they were not permitted to use.
        </div>
      )}

      <Panel title="Recent activity" bodyClassName="">
        {!result.ok ? (
          <div className="p-4">
            <ListUnavailable
              feature="Audit log"
              requiredEnv={NOT_CONFIGURED_ENV}
              result={result}
              detail="The audit table is read from the database. An empty log here would wrongly suggest nothing has ever happened."
            />
          </div>
        ) : (
          <DataTable
            caption="Recent audit log entries"
            head={
              <>
                <th scope="col" className="px-4 py-2.5">
                  When
                </th>
                <th scope="col" className="px-4 py-2.5">
                  Actor
                </th>
                <th scope="col" className="px-4 py-2.5">
                  Action
                </th>
                <th scope="col" className="px-4 py-2.5">
                  Resource
                </th>
                <th scope="col" className="px-4 py-2.5">
                  Outcome
                </th>
              </>
            }
          >
            {rows.length === 0 ? (
              <TableEmpty colSpan={5}>
                No entries yet. Actions taken in the admin area are recorded here.
              </TableEmpty>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="hover:bg-navy-50/60">
                  <td className="px-4 py-2.5 text-caption text-navy-500 tabular">
                    {new Date(row.occurredAt).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge tone="slate">{row.actorType}</Badge>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-caption text-navy-800">{row.action}</td>
                  <td className="px-4 py-2.5 text-caption text-navy-600">
                    {row.resourceType}
                    {row.resourceId && (
                      <span className="block truncate font-mono text-micro text-navy-400">
                        {row.resourceId}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge
                      tone={
                        row.outcome === "success" ? "green" : row.outcome === "denied" ? "red" : "amber"
                      }
                    >
                      {row.outcome}
                    </Badge>
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
