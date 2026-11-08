import { describe, expect, it } from "vitest";
import { htmlToText, sanitizeArticleHtml } from "@/server/content/sanitize";

/**
 * Article bodies come from authors, pasted sources and AI agents. All three are untrusted.
 * These tests are the regression net for XSS.
 */
describe("article body sanitisation", () => {
  it("removes script tags", () => {
    const out = sanitizeArticleHtml('<p>Hello</p><script>alert("xss")</script>');
    expect(out).not.toContain("<script");
    expect(out).not.toContain("alert");
    expect(out).toContain("Hello");
  });

  it("strips event handler attributes", () => {
    const out = sanitizeArticleHtml('<p onclick="steal()">text</p>');
    expect(out).not.toContain("onclick");
    expect(out).toContain("text");
  });

  it("removes javascript: URLs", () => {
    const out = sanitizeArticleHtml('<a href="javascript:alert(1)">click</a>');
    expect(out.toLowerCase()).not.toContain("javascript:");
  });

  it("removes data: URLs", () => {
    const out = sanitizeArticleHtml('<a href="data:text/html;base64,PHNjcmlwdD4=">x</a>');
    expect(out).not.toContain("data:text/html");
  });

  it("removes iframes, forms and inputs", () => {
    const out = sanitizeArticleHtml(
      '<iframe src="https://evil.test"></iframe><form action="/x"><input name="p"></form>',
    );
    expect(out).not.toContain("iframe");
    expect(out).not.toContain("<form");
    expect(out).not.toContain("<input");
  });

  it("strips style attributes and style blocks", () => {
    const out = sanitizeArticleHtml('<p style="position:fixed">x</p><style>body{display:none}</style>');
    expect(out).not.toContain("style=");
    expect(out).not.toContain("<style");
  });

  it("keeps editorial formatting that is allowed", () => {
    const input =
      "<h2>Heading</h2><p><strong>bold</strong> <em>italic</em></p><ul><li>one</li></ul><blockquote>quote</blockquote>";
    const out = sanitizeArticleHtml(input);
    expect(out).toContain("<h2>Heading</h2>");
    expect(out).toContain("<strong>bold</strong>");
    expect(out).toContain("<li>one</li>");
    expect(out).toContain("<blockquote>quote</blockquote>");
  });

  it("demotes a stray h1 to h2 so the page keeps one h1", () => {
    const out = sanitizeArticleHtml("<h1>Second title</h1>");
    expect(out).not.toContain("<h1");
    expect(out).toContain("<h2>Second title</h2>");
  });

  it("adds rel=noopener noreferrer to external links", () => {
    const out = sanitizeArticleHtml('<a href="https://example.com/story">source</a>');
    expect(out).toContain('rel="noopener noreferrer nofollow"');
    expect(out).toContain('target="_blank"');
  });

  it("does not open internal links in a new tab", () => {
    const out = sanitizeArticleHtml('<a href="/category/politics">politics</a>');
    expect(out).not.toContain('target="_blank"');
    expect(out).toContain('rel="noopener"');
  });

  it("allows mailto links", () => {
    const out = sanitizeArticleHtml('<a href="mailto:tips@example.com">email</a>');
    expect(out).toContain("mailto:tips@example.com");
  });

  it("neutralises protocol-relative URLs", () => {
    const out = sanitizeArticleHtml('<a href="//evil.test/x">x</a>');
    expect(out).not.toContain("//evil.test");
  });

  it("replaces inline images with their alt text", () => {
    const out = sanitizeArticleHtml('<img src="https://tracker.test/p.gif" alt="A chart">');
    expect(out).not.toContain("<img");
    expect(out).not.toContain("tracker.test");
    expect(out).toContain("A chart");
  });

  it("handles nested/malformed markup without throwing", () => {
    expect(() => sanitizeArticleHtml("<p><b>unclosed")).not.toThrow();
    expect(sanitizeArticleHtml("")).toBe("");
  });

  it("does not execute-able content survive inside a table cell", () => {
    const out = sanitizeArticleHtml('<table><tr><td><script>x</script>cell</td></tr></table>');
    expect(out).not.toContain("<script");
    expect(out).toContain("cell");
  });
});

describe("htmlToText", () => {
  it("extracts readable text", () => {
    expect(htmlToText("<p>Hello <strong>world</strong></p>")).toBe("Hello world");
  });

  it("truncates with an ellipsis at the limit", () => {
    const text = htmlToText(`<p>${"a".repeat(400)}</p>`, 50);
    expect(text.length).toBeLessThanOrEqual(50);
    expect(text.endsWith("…")).toBe(true);
  });

  it("collapses whitespace", () => {
    expect(htmlToText("<p>a\n\n   b</p>")).toBe("a b");
  });

  it("does not leak script content", () => {
    expect(htmlToText("<p>ok</p><script>secret</script>")).not.toContain("secret");
  });
});
