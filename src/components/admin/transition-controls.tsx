"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import type { ActionState } from "@/app/admin/articles/actions";
import { buttonClass } from "@/components/ui/styles";

export interface AvailableTransition {
  to: string;
  label: string;
  /** Visual weight: destructive actions need confirmation and a red button. */
  tone: "primary" | "secondary" | "danger";
  confirm?: string;
}

interface Props {
  articleId: string;
  transitions: AvailableTransition[];
  action: (prev: ActionState | null, formData: FormData) => Promise<ActionState>;
}

/**
 * Lifecycle buttons.
 *
 * The list of transitions is computed on the server from the actor's permissions and the
 * article's current status — so a button that would be rejected is never rendered. That is
 * presentation only: the server action re-checks everything, which is what actually stops
 * a crafted request.
 */
export function TransitionControls({ articleId, transitions, action }: Props) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(action, null);

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  if (transitions.length === 0) {
    return (
      <p className="text-sm text-navy-500">
        আপনার ভূমিকার জন্য এই লেখায় এখন কোনো ধাপ উপলব্ধ নেই।
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {state && (
        <p
          role="status"
          className={`rounded-md px-3 py-2 text-sm ring-1 ${
            state.ok
              ? "bg-verify-500/10 text-verify-600 ring-verify-500/30"
              : "bg-signal-50 text-signal-800 ring-signal-300"
          }`}
        >
          {state.message}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {transitions.map((t) => (
          <form
            key={t.to}
            action={formAction}
            onSubmit={(event) => {
              // Destructive and irreversible-feeling actions require explicit confirmation.
              if (t.confirm && !window.confirm(t.confirm)) event.preventDefault();
            }}
          >
            <input type="hidden" name="id" value={articleId} />
            <input type="hidden" name="to" value={t.to} />
            <button
              type="submit"
              disabled={pending}
              className={buttonClass(
                t.tone === "danger" ? "danger" : t.tone === "primary" ? "primary" : "secondary",
                "sm",
              )}
            >
              {pending ? "…" : t.label}
            </button>
          </form>
        ))}
      </div>
    </div>
  );
}
