import Link from "next/link";
import { BrandLink } from "@/components/brand";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center px-6 text-center">
      <BrandLink size="md" />
      <p className="mt-8 text-xs font-bold tracking-widest text-signal-600 uppercase">
        Error 404
      </p>
      <h1 className="mt-2 font-serif text-3xl font-extrabold text-navy-900">Page not found</h1>
      <p className="mt-3 text-sm text-navy-600">
        The page you were looking for does not exist, may have been moved, or may have been
        unpublished.
      </p>
      <div className="mt-6 flex gap-3">
        <Link
          href="/"
          className="rounded-md bg-navy-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-navy-800"
        >
          Back to the homepage
        </Link>
        <Link
          href="/search"
          className="rounded-md px-5 py-2.5 text-sm font-semibold text-navy-900 ring-1 ring-navy-300 hover:bg-navy-50"
        >
          Search
        </Link>
      </div>
    </div>
  );
}
