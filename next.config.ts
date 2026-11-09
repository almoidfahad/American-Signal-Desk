import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

/**
 * Baseline security headers. CSP is intentionally delegated to middleware so it can
 * carry a per-request nonce; see src/proxy.ts.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Production refuses framing entirely. In development the app is shown inside the
  // sandbox preview's iframe, and DENY makes that preview render as a blank/error frame
  // rather than the site - a dev-only concession that never reaches a production build.
  { key: "X-Frame-Options", value: isProd ? "DENY" : "" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  {
    key: "Strict-Transport-Security",
    value: isProd ? "max-age=63072000; includeSubDomains; preload" : "",
  },
];

/**
 * Hosts allowed to reach the dev server's internal resources (HMR, dev assets).
 *
 * Next.js blocks cross-origin access to dev resources by default. When the app is previewed
 * through a proxied host the browser's origin no longer matches localhost, so HMR is refused
 * and the preview degrades. Reading the host from an env var keeps this out of production
 * behaviour and avoids hard-coding one sandbox's domain into the repo.
 */
const devOrigins = (process.env.ALLOWED_DEV_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  ...(devOrigins.length > 0 ? { allowedDevOrigins: devOrigins } : {}),
  poweredByHeader: false,
  // Fail the production build on type errors rather than silently shipping them.
  typescript: { ignoreBuildErrors: false },
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [{ protocol: "https", hostname: "*.supabase.co" }],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders.filter((h) => h.value !== ""),
      },
      {
        // Admin and authenticated API responses must never be cached by a shared cache.
        source: "/admin/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
      {
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-store, max-age=0" }],
      },
    ];
  },
};

export default nextConfig;
