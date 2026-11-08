/**
 * Article body sanitisation.
 *
 * Every article body is treated as untrusted input — whether it was written by a human
 * author, pasted from a source, or produced by an AI agent. Sanitising happens on the
 * server immediately before render, so a compromised or buggy writer cannot inject script.
 *
 * Allowlist only. No `style`, no `class`, no event handlers, no `javascript:` URLs,
 * no iframes, no forms. Links are forced to safe schemes and get rel attributes.
 */
import sanitizeHtml from "sanitize-html";

const ALLOWED_TAGS = [
  "p", "br", "hr",
  "h2", "h3", "h4",
  "strong", "b", "em", "i", "u", "s", "del", "mark",
  "ul", "ol", "li",
  "blockquote", "cite",
  "a",
  "figure", "figcaption",
  "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption",
  "sup", "sub",
  "code", "pre",
];

const SAFE_SCHEMES = ["http", "https", "mailto"];

export function sanitizeArticleHtml(dirty: string): string {
  return sanitizeHtml(dirty, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ["href", "title", "rel", "target"],
      img: [], // images are rendered by the template from media assets, not inline
      th: ["scope", "colspan", "rowspan"],
      td: ["colspan", "rowspan"],
      "*": [],
    },
    allowedSchemes: SAFE_SCHEMES,
    allowedSchemesAppliedToAttributes: ["href"],
    allowProtocolRelative: false,
    disallowedTagsMode: "discard",
    transformTags: {
      // Force external links to open safely without leaking the referrer.
      a: (tagName, attribs) => {
        const href = attribs.href ?? "";
        const isExternal = /^https?:\/\//i.test(href);
        return {
          tagName,
          attribs: {
            href,
            ...(attribs.title ? { title: attribs.title } : {}),
            ...(isExternal
              ? { target: "_blank", rel: "noopener noreferrer nofollow" }
              : { rel: "noopener" }),
          },
        };
      },
      // Demote stray h1 in body copy: the page owns its single h1.
      h1: "h2",
      img: (_tagName, attribs) => ({
        tagName: "span",
        text: attribs.alt ?? "",
        attribs: {},
      }),
    },
    exclusiveFilter: (frame) => frame.tag === "span" && !frame.text.trim(),
  });
}

/** Plain-text extraction for search indexing and meta descriptions. */
export function htmlToText(html: string, maxLength = 320): string {
  const text = sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}
