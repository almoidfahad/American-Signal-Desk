import { formatNewsroom } from "@/lib/dates";
import type { Metadata } from "next";
import { Badge, DataTable, PageHeader, Panel, TableEmpty } from "@/components/admin/ui";
import { ListUnavailable } from "@/components/admin/list-states";
import { requireAdminPage } from "@/server/admin/guard";
import { listUsers, NOT_CONFIGURED_ENV } from "@/server/admin/queries";

export const metadata: Metadata = { title: "Users & Roles" };
export const dynamic = "force-dynamic";

const ROLE_TONE: Record<string, "red" | "navy" | "green" | "amber" | "slate"> = {
  super_admin: "red",
  admin: "navy",
  editor: "green",
  author: "amber",
  analyst: "slate",
};

/**
 * Staff accounts and the roles attached to them.
 *
 * Read-only. Role changes need `role.manage`, an audit entry and a re-issue of session claims
 * - only the permission check exists, so the page does not pretend the rest does.
 *
 * The MFA column is not decoration. Privileged access requires a second factor, so an
 * operator needs to see which privileged accounts have not enrolled; that list is the
 * actionable part of this page.
 */
export default async function UsersPage() {
  const access = await requireAdminPage("user.read");
  if (!access.ok) return access.node;

  const result = await listUsers();
  const rows = result.ok ? result.data : [];
  const unenrolled = rows.filter(
    (row) =>
      !row.mfaEnrolled &&
      row.roles.some((role) => role === "admin" || role === "super_admin" || role === "editor"),
  ).length;

  return (
    <div>
      <PageHeader
        title="Users & Roles"
        description="Staff accounts, their roles, and whether each privileged account has enrolled a second factor."
        actions={
          <span className="rounded-md border border-navy-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-navy-700">
            {result.ok ? `${rows.length} account${rows.length === 1 ? "" : "s"}` : "Count unavailable"}
          </span>
        }
      />

      {result.ok && unenrolled > 0 && (
        <div className="mb-4 rounded-md bg-amber-50 px-4 py-3 text-[12.5px] text-amber-900 ring-1 ring-amber-300">
          <span className="font-bold">
            {unenrolled} privileged account{unenrolled === 1 ? "" : "s"} without a second factor.
          </span>{" "}
          MFA is required by policy for privileged roles; those sign-ins are blocked until it is
          enrolled.
        </div>
      )}

      <Panel title="Accounts" bodyClassName="">
        {!result.ok ? (
          <div className="p-4">
            <ListUnavailable
              feature="Staff directory"
              requiredEnv={NOT_CONFIGURED_ENV}
              result={result}
              detail="Accounts are read from the database. With no database configured there is no directory to show."
            />
          </div>
        ) : (
          <DataTable
            caption="Staff accounts"
            head={
              <>
                <th scope="col" className="px-4 py-2.5">
                  Person
                </th>
                <th scope="col" className="px-4 py-2.5">
                  Roles
                </th>
                <th scope="col" className="px-4 py-2.5">
                  Status
                </th>
                <th scope="col" className="px-4 py-2.5">
                  Second factor
                </th>
                <th scope="col" className="px-4 py-2.5">
                  Last sign-in
                </th>
              </>
            }
          >
            {rows.length === 0 ? (
              <TableEmpty colSpan={5}>
                No accounts yet. Staff appear here once they accept an invitation.
              </TableEmpty>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="hover:bg-navy-50/60">
                  <td className="px-4 py-2.5">
                    <span className="block font-semibold text-navy-900">{row.displayName}</span>
                    <span className="block text-[11.5px] text-navy-500">{row.email ?? "-"}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    {row.roles.length === 0 ? (
                      <Badge tone="amber">No role</Badge>
                    ) : (
                      <span className="flex flex-wrap gap-1">
                        {row.roles.map((role) => (
                          <Badge key={role} tone={ROLE_TONE[role] ?? "slate"}>
                            {role.replace(/_/g, " ")}
                          </Badge>
                        ))}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge tone={row.status === "active" ? "green" : "red"}>{row.status}</Badge>
                  </td>
                  <td className="px-4 py-2.5 text-[12px]">
                    {row.mfaEnrolled ? (
                      <span className="font-semibold text-verify-600">Enrolled</span>
                    ) : (
                      <span className="text-navy-500">Not enrolled</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-[12px] text-navy-500 tabular">
                    {row.lastLoginAt
                      ? formatNewsroom(row.lastLoginAt)
                      : "Never"}
                  </td>
                </tr>
              ))
            )}
          </DataTable>
        )}
      </Panel>

      <p className="mt-3 max-w-2xl text-[11.5px] leading-relaxed text-navy-500">
        Role changes are not wired up in this build. Assigning a role needs{" "}
        <span className="font-mono">role.manage</span>, an audit entry and a refreshed session
        claim; only the first of those exists, so the table is read-only rather than showing a
        control that would do nothing.
      </p>
    </div>
  );
}
