import type { Metadata } from "next";
import { Badge, PageHeader, Panel } from "@/components/admin/ui";
import { requireAdminPage } from "@/server/admin/guard";
import { envFacts, posture } from "@/server/admin/config";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

/**
 * Settings.
 *
 * A settings page that cannot save is worse than none, so there are no editable fields here.
 * What it does instead is genuinely useful and fully honest: it reports which environment
 * variables this running instance can see, and — for each one that is absent — what stops
 * working as a result. Values are never rendered, only presence.
 */
export default async function SettingsPage() {
  const access = await requireAdminPage("settings.read");
  if (!access.ok) return access.node;

  const facts = envFacts();
  const present = facts.filter((fact) => fact.present).length;
  const state = posture();

  return (
    <div>
      <PageHeader
        title="Settings"
        description="What this deployment can see, and what each missing setting disables. Values are never displayed - only whether a variable is set."
        actions={
          <span className="rounded-md border border-navy-200 bg-white px-3 py-1.5 text-caption font-semibold text-navy-700">
            {present} of {facts.length} configured
          </span>
        }
      />

      <div className="mb-4 rounded-md bg-navy-50 px-4 py-3 text-small leading-relaxed text-navy-700 ring-1 ring-navy-200">
        <p className="font-bold">Nothing on this page is editable</p>
        <p className="mt-1">
          Settings are supplied by the environment. There is no settings table and no write
          path, so no field is rendered - a form that discarded input on submit would look like
          a successful save.
        </p>
      </div>

      <Panel title="Environment" bodyClassName="">
        <ul className="divide-y divide-navy-50">
          {facts.map((fact) => (
            <li key={fact.name} className="flex flex-wrap items-start gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-mono text-caption font-semibold text-navy-900">{fact.name}</p>
                <p className="mt-0.5 text-caption text-navy-600">{fact.purpose}</p>
                {!fact.present && (
                  <p className="mt-1 text-caption leading-relaxed text-signal-800">
                    Missing - {fact.ifMissing}.
                  </p>
                )}
              </div>
              <Badge tone={fact.present ? "green" : "slate"}>
                {fact.present ? "Set" : "Not set"}
              </Badge>
            </li>
          ))}
        </ul>
      </Panel>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Content source" bodyClassName="p-4">
          <p className="text-small text-navy-700">
            The public site is currently serving{" "}
            <span className="font-bold">
              {state.contentMode === "live"
                ? "live content from the database"
                : state.contentMode === "demo"
                  ? "sample content, clearly labelled as such"
                  : "no content at all"}
            </span>
            .
          </p>
          <p className="mt-1.5 text-caption leading-relaxed text-navy-500">
            Sample articles carry a visible notice in the public UI. Nothing marked sample is
            real reporting.
          </p>
        </Panel>

        <Panel title="Security posture" bodyClassName="p-4">
          <p className="text-small text-navy-700">
            Second factor for privileged roles:{" "}
            <span className="font-bold">
              {state.mfaRequired ? "required" : "not required by policy"}
            </span>
            .
          </p>
          {state.mfaExplicitlyDisabled && (
            <p className="mt-1.5 rounded bg-amber-50 px-2.5 py-2 text-caption leading-relaxed text-amber-900">
              REQUIRE_MFA_FOR_ADMIN is explicitly disabled. That is a deliberate choice recorded
              here so it cannot happen quietly.
            </p>
          )}
          <p className="mt-1.5 text-caption leading-relaxed text-navy-500">
            The default when the flag is unset is to require it, so a missing setting fails
            closed.
          </p>
        </Panel>
      </div>
    </div>
  );
}
