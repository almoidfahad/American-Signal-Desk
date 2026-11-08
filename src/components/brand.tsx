import Link from "next/link";

/**
 * Wordmark. The star-and-bars device is drawn in SVG so it stays crisp, scales,
 * and needs no image request.
 */
export function StarMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} role="presentation" aria-hidden="true" focusable="false">
      <path
        d="M32 2.5 39.6 22.6 61 23.4 44.4 36.7 49.8 57.3 32 45.6 14.2 57.3 19.6 36.7 3 23.4 24.4 22.6Z"
        fill="#ffffffff"
        stroke="#d81414"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M6 40h22v4H6z" fill="#d81414" />
      <path d="M2 48h22v4H2z" fill="#d81414" />
      <path d="M0 56h22v4H0z" fill="#d81414" />
    </svg>
  );
}

export function Wordmark({
  variant = "dark",
  size = "md",
}: {
  /** `dark` = navy text on light background; `light` = white text on navy. */
  variant?: "dark" | "light";
  size?: "sm" | "md" | "lg";
}) {
  const titleSize = size === "lg" ? "text-3xl sm:text-4xl" : size === "sm" ? "text-lg" : "text-2xl";
  const taglineSize = size === "sm" ? "text-[10px]" : "text-xs";
  const primary = variant === "light" ? "text-white" : "text-navy-900";

  return (
    <span className="flex items-center gap-3">
      <StarMark className={size === "sm" ? "h-7 w-7" : size === "lg" ? "h-12 w-12" : "h-10 w-10"} />
      <span className="flex flex-col leading-none">
        <span className={`font-extrabold tracking-tight ${primary} ${titleSize}`}>
          AMERICAN
        </span>
        <span className={`font-extrabold tracking-tight text-signal-600 ${titleSize}`}>
          SIGNAL DESK
        </span>
        {size !== "sm" && (
          <span
            className={`mt-1 font-medium ${taglineSize} ${
              variant === "light" ? "text-navy-200" : "text-navy-600"
            }`}
          >
            Trusted News. A Stronger America.
          </span>
        )}
      </span>
    </span>
  );
}

export function BrandLink({
  variant = "dark",
  size = "md",
  href = "/",
}: {
  variant?: "dark" | "light";
  size?: "sm" | "md" | "lg";
  href?: string;
}) {
  return (
    <Link
      href={href}
      className="inline-flex rounded-sm"
      aria-label="American Signal Desk — home"
    >
      <Wordmark variant={variant} size={size} />
    </Link>
  );
}
