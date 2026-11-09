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

const INPUT =
  "mt-1 h-10 w-full rounded-md border border-navy-200 bg-white px-3 text-[13.5px] text-navy-900 placeholder:text-navy-400 focus:border-navy-500";

/**
 * An inline field error.
 *
 * The `id` is required and not optional: an error that cannot be addressed by
 * `aria-describedby` is only half-announced, and a *missing* id is exactly the bug
 * this used to have — `aria-describedby="title-error"` pointing at an element that
 * did not exist. Making the id mandatory means that mistake cannot compile.
 *
 * `role="alert"` still announces the message when it appears, so a reader is told
 * twice over: once on appearance, and again when focus returns to the field.
 */
function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1 text-[11.5px] font-semibold text-signal-700">
      {message}
    </p>
  );
}

function Label({
  htmlFor,
  children,
  required,
  hint,
}: {
  htmlFor: string;
  children: React.ReactNode;
  required?: boolean;
  hint?: string;
}) {
  return (
    <label htmlFor={htmlFor} className="block text-[12.5px] font-bold text-navy-900">
      {children}
      {required && (
        <span className="ml-0.5 text-signal-600" aria-hidden="true">
          *
        </span>
      )}
      {hint && <span className="ml-1 font-normal text-navy-500">{hint}</span>}
    </label>
  );
}

/**
 * Article editor.
 *
 * The slug derives from the title until the author edits it, then stops - silently rewriting
 * a URL an author has typed would be the kind of help that costs trust. Once published, the
 * slug is immutable; the field is read-only for published copy rather than merely validated,
 * because a changed URL orphans every inbound link.
 *
 * The body is authored as HTML and sanitised server-side at render. The hint below says so
 * plainly rather than implying the textarea is safe to paste anything into.
 */
export function ArticleForm({ mode, action, article, categories, readOnly = false }: Props) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(action, null);

  const [title, setTitle] = useState(article?.title ?? "");
  const [slug, setSlug] = useState(article?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(mode === "edit");
  const [body, setBody] = useState(article?.bodyHtml ?? "");

  const effectiveSlug = slugTouched ? slug : slugify(title);

  useEffect(() => {
    if (state?.ok && state.redirectTo) {
      router.push(state.redirectTo);
    } else if (state?.ok) {
      router.refresh();
    }
  }, [state, router]);

  const fieldErrors = state?.fieldErrors ?? {};
  const wordCount = body
    .replace(/<[^>]*>/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {article && <input type="hidden" name="id" value={article.id} />}

      {state && (
        <p
          role="status"
          className={`rounded-md px-3 py-2 text-[13px] font-medium ring-1 ${
            state.ok
              ? "bg-verify-50 text-verify-600 ring-verify-500/30"
              : "bg-signal-50 text-signal-800 ring-signal-300"
          }`}
        >
          {state.message}
        </p>
      )}

      {readOnly && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900 ring-1 ring-amber-300">
          Published articles can no longer be edited in place. To amend one, return it to draft
          first so the change is recorded in the revision history.
        </p>
      )}

      <fieldset disabled={pending || readOnly} className="space-y-5">
        <div>
          <Label htmlFor="title" required>
            Headline
          </Label>
          <input
            id="title"
            name="title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
            maxLength={300}
            placeholder="What happened, in plain terms"
            aria-invalid={Boolean(fieldErrors.title)}
            aria-describedby={fieldErrors.title ? "title-error" : undefined}
            className={`${INPUT} text-[15px] font-semibold`}
          />
          <div id="title-error">
            <FieldError id="title-error" message={fieldErrors.title} />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="slug" required>
              URL slug
            </Label>
            <div className="mt-1 flex items-center rounded-md border border-navy-200 bg-white focus-within:border-navy-500">
              <span className="pl-3 font-mono text-[11.5px] text-navy-400">/article/</span>
              <input
                id="slug"
                name="slug"
                value={effectiveSlug}
                onChange={(event) => {
                  setSlug(event.target.value);
                  setSlugTouched(true);
                }}
                required
                maxLength={120}
                aria-describedby={fieldErrors.slug ? "slug-help slug-error" : "slug-help"}
                aria-invalid={Boolean(fieldErrors.slug)}
                className="h-10 w-full rounded-r-md px-2 font-mono text-[12.5px] outline-none"
              />
            </div>
            <p id="slug-help" className="mt-1 text-[11px] text-navy-500">
              Lowercase letters, numbers and hyphens. Fixed once published.
            </p>
            <FieldError id="slug-error" message={fieldErrors.slug} />
          </div>

          <div>
            <Label htmlFor="categoryId">Section</Label>
            <select
              id="categoryId"
              name="categoryId"
              defaultValue={article?.categoryId ?? ""}
              className={INPUT}
            >
              <option value="">- Select a section -</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <Label htmlFor="dek" hint="(the standfirst under the headline)">
            Summary
          </Label>
          <textarea
            id="dek"
            name="dek"
            defaultValue={article?.dek ?? ""}
            rows={2}
            maxLength={400}
            placeholder="One or two sentences a reader could stop at."
            aria-invalid={Boolean(fieldErrors.dek)}
            aria-describedby={fieldErrors.dek ? "dek-error" : undefined}
            className="mt-1 w-full rounded-md border border-navy-200 bg-white px-3 py-2 text-[13.5px] focus:border-navy-500"
          />
          <FieldError id="dek-error" message={fieldErrors.dek} />
        </div>

        <div>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <Label htmlFor="bodyHtml">Body</Label>
            <span className="text-[11px] text-navy-500 tabular">
              {body.length.toLocaleString("en-US")} characters
              <span aria-hidden="true" className="mx-1.5">
                *
              </span>
              ~{wordCount.toLocaleString("en-US")} words
            </span>
          </div>
          <textarea
            id="bodyHtml"
            name="bodyHtml"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={18}
            spellCheck
            aria-invalid={Boolean(fieldErrors.bodyHtml)}
            aria-describedby={fieldErrors.bodyHtml ? "bodyHtml-help bodyHtml-error" : "bodyHtml-help"}
            className="mt-1 w-full rounded-md border border-navy-200 bg-white px-3 py-2 font-mono text-[12.5px] leading-relaxed focus:border-navy-500"
          />
          <p id="bodyHtml-help" className="mt-1 text-[11px] leading-snug text-navy-500">
            Allowed tags: p, h2, h3, strong, em, ul, ol, li, blockquote, a, table. Scripts and
            inline styles are stripped at render time, not on save - so saving never silently
            alters what you wrote.
          </p>
          <FieldError id="bodyHtml-error" message={fieldErrors.bodyHtml} />
        </div>

        <details className="rounded-md border border-navy-200 bg-navy-50/50 p-3">
          <summary className="cursor-pointer text-[12.5px] font-bold text-navy-900">
            Hero image <span className="font-normal text-navy-500">(optional)</span>
          </summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="heroImageUrl">Image URL</Label>
              <input
                id="heroImageUrl"
                name="heroImageUrl"
                type="url"
                defaultValue={article?.heroImageUrl ?? ""}
                placeholder="https://…"
                aria-invalid={Boolean(fieldErrors.heroImageUrl)}
                aria-describedby={fieldErrors.heroImageUrl ? "heroImageUrl-error" : undefined}
                className={INPUT}
              />
              <FieldError id="heroImageUrl-error" message={fieldErrors.heroImageUrl} />
            </div>
            <div>
              <Label htmlFor="heroImageAlt" hint="(required for accessibility)">
                Alt text
              </Label>
              <input
                id="heroImageAlt"
                name="heroImageAlt"
                defaultValue={article?.heroImageAlt ?? ""}
                placeholder="Describe the image for a reader who cannot see it"
                className={INPUT}
              />
              <p className="mt-1 text-[11px] text-navy-500">
                Without this the image renders as a labelled placeholder.
              </p>
            </div>
          </div>
        </details>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3 border-t border-navy-100 pt-4">
        <button type="submit" disabled={pending || readOnly} className={buttonClass("primary", "md")}>
          {pending
            ? "Saving…"
            : mode === "create"
              ? "Save draft"
              : "Save changes"}
        </button>
        <Link href="/admin/articles" className={buttonClass("secondary", "md")}>
          Cancel
        </Link>
        <p className="text-[11px] text-navy-500">
          Saving never publishes. Publication is a separate, permissioned action.
        </p>
      </div>
    </form>
  );
}
