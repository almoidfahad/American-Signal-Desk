import type { Metadata } from "next";
import { PlannedFeature } from "@/components/admin/planned-feature";
import { requireAdminPage } from "@/server/admin/guard";

export const metadata: Metadata = { title: "Credit Wallet" };
export const dynamic = "force-dynamic";

/**
 * Credit wallet.
 *
 * A balance is the single most tempting number to fake in a screenshot, and the one an
 * operator is most likely to act on. There is no ledger table, no provider integration and no
 * reconciliation job, so this page shows no balance at all.
 */
export default async function CreditsPage() {
  const access = await requireAdminPage("credit.read");
  if (!access.ok) return access.node;

  return (
    <PlannedFeature
      title="Credit Wallet"
      summary="Spend against model providers, grants, and reconciliation against invoices. With no provider integration there is no balance to display."
      permission="credit.read"
      status="not_implemented"
      missing={[
        {
          item: "No ledger",
          detail:
            "A balance is the sum of an append-only ledger. No migration creates one, so any number shown here would have no source.",
        },
        {
          item: "No provider integration",
          detail:
            "Spend is reported by the model provider. No provider credential is configured, so nothing can be fetched or reconciled.",
        },
        {
          item: "No grant path",
          detail:
            "credit.grant and billing.reconcile are defined permissions with no implementation. A 'Grant credits' button would write nowhere.",
        },
      ]}
      whenReady={[
        "The balance is the sum of ledger rows, each traceable to a grant or a spend event.",
        "Spend per agent and per job is attributable, so a runaway agent is visible before the invoice arrives.",
        "Reconciliation shows the difference between our ledger and the provider's statement, including when that difference is not zero.",
      ]}
    />
  );
}
