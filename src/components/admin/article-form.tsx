"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect } from "react";
import { slugify } from "@/lib/validation/article";
import type { ActionState } from "@/app/admin/articles/actions";
import { buttonClass } from "@/components/ui/styles";

interface Category {
  id: string;
  name: string;
}

interface Props {
  mode: "create" | "edit";
  action: (prev: ActionState | null, formData: FormData) => Promise<ActionState>;
  article?: {
    id: string;
    title: string;
    slug: string;
    dek: string;
    bodyHtml: string;
    categoryId: string | null;
    heroImageUrl: string | null;
    heroImageAlt: string | null;
  };
  categories: Category[];
  /** Editing is blocked for published copy; the server refuses these writes too. */
  readOnly?: boolean;
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="mt-1 text-xs font-medium text-signal-700">
      {message}
    </p>
  );
}

export function ArticleForm({ mode, action, article, categories, readOnly = false }: Props) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(action, null);

  const [title, setTitle] = useState(article?.title ?? "");
  const [slug, setSlug] = useState(article?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(mode === "edit");
  const [body, setBody] = useState(article?.bodyHtml ?? "");

  // In create mode the slug follows the title until the author edits it manually.
  const effectiveSlug = slugTouched ? slug : slugify(title);

  useEffect(() => {
    if (state?.ok && state.redirectTo) {
      router.push(state.redirectTo);
    } else if (state?.ok) {
      router.refresh();
    }
  }, [state, router]);

  const fieldErrors = state?.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {article && <input type="hidden" name="id" value={article.id} />}

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

      {readOnly && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-300">
          প্রকাশিত লেখা সরাসরি সম্পাদনা করা যায় না। সংশোধনের জন্য প্রথমে লেখাটি ড্রাফটে ফিরিয়ে
          আনুন — তাহলে পরিবর্তনটি ইতিহাসে সংরক্ষিত থাকবে।
        </p>
      )}

      <fieldset disabled={pending || readOnly} className="space-y-5">
        <div>
          <label htmlFor="title" className="block text-sm font-semibold text-navy-900">
            শিরোনাম <span className="text-signal-600">*</span>
          </label>
          <input
            id="title"
            name="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={300}
            aria-invalid={Boolean(fieldErrors.title)}
            className="mt-1 h-11 w-full rounded-md border border-navy-200 px-3 text-sm"
          />
          <FieldError message={fieldErrors.title} />
        </div>

        <div>
          <label htmlFor="slug" className="block text-sm font-semibold text-navy-900">
            স্লাগ (URL) <span className="text-signal-600">*</span>
          </label>
          <div className="mt-1 flex items-center rounded-md border border-navy-200 focus-within:ring-2 focus-within:ring-navy-400">
            <span className="pl-3 font-mono text-xs text-navy-500">/article/</span>
            <input
              id="slug"
              name="slug"
              value={effectiveSlug}
              onChange={(e) => {
                setSlug(e.target.value);
                setSlugTouched(true);
              }}
              required
              maxLength={120}
              aria-describedby="slug-help"
              aria-invalid={Boolean(fieldErrors.slug)}
              className="h-11 w-full rounded-r-md px-2 font-mono text-sm outline-none"
            />
          </div>
          <p id="slug-help" className="mt-1 text-xs text-navy-500">
            শুধু ছোট হাতের অক্ষর, সংখ্যা ও হাইফেন। এটি প্রকাশের পর আর বদলাবে না।
          </p>
          <FieldError message={fieldErrors.slug} />
        </div>

        <div>
          <label htmlFor="dek" className="block text-sm font-semibold text-navy-900">
            সারসংক্ষেপ
          </label>
          <textarea
            id="dek"
            name="dek"
            defaultValue={article?.dek ?? ""}
            rows={2}
            maxLength={400}
            className="mt-1 w-full rounded-md border border-navy-200 px-3 py-2 text-sm"
          />
          <FieldError message={fieldErrors.dek} />
        </div>

        <div>
          <label htmlFor="categoryId" className="block text-sm font-semibold text-navy-900">
            বিভাগ
          </label>
          <select
            id="categoryId"
            name="categoryId"
            defaultValue={article?.categoryId ?? ""}
            className="mt-1 h-11 w-full rounded-md border border-navy-200 px-3 text-sm"
          >
            <option value="">— নির্বাচন করুন —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <div className="flex items-baseline justify-between">
            <label htmlFor="bodyHtml" className="block text-sm font-semibold text-navy-900">
              লেখা (HTML)
            </label>
            <span className="text-xs text-navy-500">{body.length.toLocaleString("en-US")} অক্ষর</span>
          </div>
          <textarea
            id="bodyHtml"
            name="bodyHtml"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={18}
            className="mt-1 w-full rounded-md border border-navy-200 px-3 py-2 font-mono text-[13px] leading-relaxed"
          />
          <p className="mt-1 text-xs text-navy-500">
            অনুমোদিত ট্যাগ: p, h2, h3, strong, em, ul, ol, li, blockquote, a, table। স্ক্রিপ্ট ও
            ইনলাইন স্টাইল সেভের সময় নয়, প্রকাশের সময় স্বয়ংক্রিয়ভাবে বাদ দেওয়া হয়।
          </p>
          <FieldError message={fieldErrors.bodyHtml} />
        </div>

        <details className="rounded-md border border-navy-200 p-3">
          <summary className="cursor-pointer text-sm font-semibold text-navy-900">
            প্রধান ছবি (ঐচ্ছিক)
          </summary>
          <div className="mt-3 space-y-3">
            <div>
              <label htmlFor="heroImageUrl" className="block text-xs font-semibold text-navy-700">
                ছবির URL
              </label>
              <input
                id="heroImageUrl"
                name="heroImageUrl"
                type="url"
                defaultValue={article?.heroImageUrl ?? ""}
                className="mt-1 h-10 w-full rounded-md border border-navy-200 px-3 text-sm"
              />
              <FieldError message={fieldErrors.heroImageUrl} />
            </div>
            <div>
              <label htmlFor="heroImageAlt" className="block text-xs font-semibold text-navy-700">
                Alt টেক্সট (অ্যাক্সেসিবিলিটির জন্য আবশ্যক)
              </label>
              <input
                id="heroImageAlt"
                name="heroImageAlt"
                defaultValue={article?.heroImageAlt ?? ""}
                className="mt-1 h-10 w-full rounded-md border border-navy-200 px-3 text-sm"
              />
            </div>
          </div>
        </details>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3 border-t border-navy-100 pt-4">
        <button type="submit" disabled={pending || readOnly} className={buttonClass("primary", "md")}>
          {pending ? "সংরক্ষণ হচ্ছে…" : mode === "create" ? "ড্রাফট সংরক্ষণ করুন" : "পরিবর্তন সংরক্ষণ করুন"}
        </button>
        <Link href="/admin/articles" className={buttonClass("secondary", "md")}>
          ফিরে যান
        </Link>
      </div>
    </form>
  );
}
