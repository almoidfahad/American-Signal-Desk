import localFont from "next/font/local";

/**
 * Inter, self-hosted.
 *
 * Why not a CDN `<link>`, which is the usual shortcut: this app sends
 * `font-src 'self' data:` in its Content-Security-Policy, so fonts.googleapis.com is blocked
 * by the browser. Loading from a CDN here would not fail loudly - it would silently fall back
 * to the system stack, which is exactly the state this file fixes. It would also make the
 * rendering path depend on a third party that cannot see our CSP.
 *
 * Why `next/font/local` rather than a plain @font-face: Next fingerprints the file into
 * `_next/static`, preloads the one weight range the page actually uses, and generates
 * `size-adjust`/`ascent-override` metrics for the fallback so swapping in Inter does not
 * shift the layout (CLS).
 *
 * The file is the variable-weight Latin subset (SIL Open Font License 1.1 - see
 * src/fonts/Inter-LICENSE.txt). Variable means one 48 KB file covers 100-900 instead of six
 * static weights.
 */
export const inter = localFont({
  src: [
    {
      path: "../fonts/Inter-latin-var.woff2",
      weight: "100 900",
      style: "normal",
    },
    {
      path: "../fonts/Inter-latin-var-italic.woff2",
      weight: "100 900",
      style: "italic",
    },
  ],
  // Exposed to CSS as --font-inter, so globals.css owns the fallback chain.
  variable: "--font-inter",
  display: "swap",
  // A page weight that changes shape after first paint is worse than one extra 100 ms;
  // `swap` keeps text visible while the file arrives.
  preload: true,
  fallback: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Arial"],
  adjustFontFallback: "Arial",
});
