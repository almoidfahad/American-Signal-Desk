"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * Route-level error boundary.
 *
 * Shows a correlation id rather than the exception text: readers should not see stack
 * traces or database errors, and operators can correlate with the server log.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The message is safe to log client-side; the digest links it to the server log.
    console.error("[client-error]", error.digest ?? "no-digest", error.message);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center px-6 text-center">
      <p className="text-xs font-bold tracking-widest text-signal-600 uppercase">Error</p>
      <h1 className="mt-2 font-serif text-3xl font-extrabold text-navy-900">
        Something went wrong
      </h1>
      <p className="mt-3 text-sm text-navy-600">
        We could not load this page. The failure has been logged. If you contact support, quote
        the reference below.
      </p>
      <code className="mt-3 rounded bg-navy-50 px-3 py-1.5 font-mono text-xs text-navy-800">
        {error.digest ?? "no reference"}
      </code>
      <div className="mt-6 flex gap-3">
        <button
          onClick={reset}
          className="rounded-md bg-navy-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-navy-800"
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded-md px-5 py-2.5 text-sm font-semibold text-navy-900 ring-1 ring-navy-300 hover:bg-navy-50"
        >
          Go to the homepage
        </Link>
      </div>
    </div>
  );
}
