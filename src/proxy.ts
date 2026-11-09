import { NextResponse, type NextRequest } from "next/server";

/**
 * Request proxy (Next.js 16 renamed the `middleware` convention to `proxy`).
 *
 * Runs on the Node.js runtime.
 *
 * Responsibilities:
 *  1. Per-request CSP nonce (so `script-src` does not need `unsafe-inline`).
 *  2. Session refresh for admin routes (cookie rotation must happen in the proxy because
 *     Server Components cannot write cookies).
 *  3. Cheap gate that redirects obvious unauthenticated requests to the login page.
 *
 * IMPORTANT: the proxy is a convenience, not the security boundary. Every admin page and
 * server action re-checks session, role and permission server-side. The proxy only avoids
 * rendering a page that would be denied anyway.
 */

const ADMIN_PREFIX = "/admin";
const PUBLIC_ADMIN_PATHS = ["/admin/login", "/admin/login/mfa", "/admin/login/reset"];

function buildCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV !== "production";
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

  return [
    "default-src 'self'",
    // 'strict-dynamic' lets the nonce-bearing bundle load its own chunks.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${isDev ? "'unsafe-eval'" : ""}`.trim(),
    // Tailwind injects styles; inline style attributes are used by a few components.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: " + (supabaseUrl ? `${supabaseUrl} ` : "") + "https:",
    "font-src 'self' data:",
    // `ws:` alone does not cover a secure preview origin: the HMR socket there is `wss:`,
    // so without it the live preview loads the page but never connects.
    `connect-src 'self' ${supabaseUrl} ${supabaseUrl.replace("https://", "wss://")} ${isDev ? "ws: wss: http://localhost:*" : ""}`.trim(),
    // Production: no framing at all. Development: the app is embedded by the sandbox
    // preview, so an iframe that is refused would show this as a broken page.
    isDev ? "frame-ancestors 'self' https: http:" : "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const nonce = crypto.randomUUID().replace(/-/g, "");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  let response = NextResponse.next({ request: { headers: requestHeaders } });

  // --- Session refresh for admin routes -----------------------------------
  if (pathname.startsWith(ADMIN_PREFIX) && !PUBLIC_ADMIN_PATHS.some((p) => pathname.startsWith(p))) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnon) {
      // No auth backend at all: send people to the login page, which explains why.
      const url = request.nextUrl.clone();
      url.pathname = "/admin/login";
      url.search = "";
      return NextResponse.redirect(url);
    }

    // Fast cookie-presence check. A missing session cookie cannot be a valid session,
    // so redirecting early avoids a wasted render. Real verification happens server-side.
    const hasSessionCookie = request.cookies
      .getAll()
      .some((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"));

    if (!hasSessionCookie) {
      const url = request.nextUrl.clone();
      url.pathname = "/admin/login";
      url.search = `?next=${encodeURIComponent(pathname)}`;
      return NextResponse.redirect(url);
    }

    // Rotate/refresh the session using the SSR client so the cookie stays valid.
    const { createServerClient } = await import("@supabase/ssr");
    const supabase = createServerClient(supabaseUrl, supabaseAnon, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request: { headers: requestHeaders } });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    });

    await supabase.auth.getUser();
  }

  response.headers.set("Content-Security-Policy", buildCsp(nonce));
  response.headers.set("x-nonce", nonce);
  return response;
}

export const config = {
  matcher: [
    /*
     * Run on all paths except static assets and image optimisation, which do not need a
     * CSP nonce and would pay the middleware cost on every request.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico)$).*)",
  ],
};
