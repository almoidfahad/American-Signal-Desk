"use client";

import { useState } from "react";

/**
 * Social sharing.
 *
 * Plain links to each network's share endpoint — no third-party script, no tracking pixel,
 * nothing that loads before the reader asks for it. That matters twice over on a news site:
 * third-party share widgets are a common source of layout shift and of reader tracking that
 * the privacy policy would then have to disclose.
 *
 * "Copy link" is the one button with real behaviour, and it reports honestly whether the
 * clipboard write succeeded — browsers deny clipboard access in plenty of situations, and a
 * silent "Copied!" that copied nothing is worse than an error.
 */
export function ShareMenu({
  url,
  title,
  variant = "inline",
}: {
  url: string;
  title: string;
  variant?: "inline" | "block";
}) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title);

  const networks = [
    { label: "X", href: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}` },
    { label: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}` },
    {
      label: "LinkedIn",
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
    },
    { label: "Email", href: `mailto:?subject=${encodedTitle}&body=${encodedUrl}` },
  ];

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setStatus("copied");
      window.setTimeout(() => setStatus("idle"), 2500);
    } catch {
      setStatus("failed");
    }
  }

  return (
    <div
      className={
        variant === "inline"
          ? "flex flex-wrap items-center gap-1.5"
          : "flex flex-wrap items-center gap-2 border-y border-navy-100 py-3"
      }
    >
      <span className="mr-1 text-caption font-bold tracking-[0.1em] text-navy-500 uppercase">
        Share
      </span>
      {networks.map((network) => (
        <a
          key={network.label}
          href={network.href}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="rounded border border-navy-200 px-2 py-1 text-caption font-semibold text-navy-700 transition-colors hover:border-navy-900 hover:text-navy-900"
        >
          {network.label}
        </a>
      ))}
      <button
        type="button"
        onClick={copy}
        className="rounded border border-navy-200 px-2 py-1 text-caption font-semibold text-navy-700 transition-colors hover:border-navy-900 hover:text-navy-900"
      >
        {status === "copied" ? "Copied" : "Copy link"}
      </button>
      {status !== "idle" && (
        <span
          role="status"
          className={`text-caption font-medium ${
            status === "failed" ? "text-signal-700" : "text-verify-600"
          }`}
        >
          {status === "failed" ? "Clipboard blocked — copy the address bar instead." : ""}
        </span>
      )}
    </div>
  );
}
