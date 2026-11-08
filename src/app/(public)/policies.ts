/**
 * Policy page copy.
 *
 * These are honest starting drafts that describe what the software actually does.
 * They are NOT legal advice and must be reviewed by counsel before launch — that is
 * stated on each page rather than being quietly assumed.
 */
export interface PolicySection {
  heading: string;
  body: string[];
}

export interface PolicyDoc {
  slug: string;
  title: string;
  summary: string;
  updated: string;
  sections: PolicySection[];
}

const UPDATED = "November 8, 2026";
const REVIEW_NOTICE =
  "This document is a working draft prepared alongside the platform build. It must be reviewed by qualified legal counsel before the site goes live.";

export const POLICIES: PolicyDoc[] = [
  {
    slug: "editorial-standards",
    title: "Editorial Standards",
    summary: "How American Signal Desk reports, reviews and corrects the news.",
    updated: UPDATED,
    sections: [
      {
        heading: "Our commitment",
        body: [
          "We report what we can verify, attribute what we cannot, and publish corrections when we get something wrong.",
          "Every article passes through an editorial review before publication. Drafts — including AI-assisted drafts — are not published material.",
        ],
      },
      {
        heading: "Human review is mandatory",
        body: [
          "No automated system can publish directly to this site. Articles produced with AI assistance are treated as untrusted drafts until a human editor reviews sources, verifies claims, and approves the piece.",
          "Articles that received AI assistance carry a visible disclosure on the page, naming the reviewing editor.",
        ],
      },
      {
        heading: "Sourcing",
        body: [
          "Each claim in an article should trace to a source recorded in our system: a document, a named interview, a public record, or a clearly attributed report from another outlet.",
          "We do not republish third-party articles in full. We summarise and attribute, within the terms those sources permit.",
          "Allegations are labelled as allegations. Analysis is labelled as analysis. Opinion is labelled as opinion.",
        ],
      },
      {
        heading: "Corrections",
        body: [
          "Corrections are published on the corrections page and appended to the article's revision history. We do not silently edit published stories.",
        ],
      },
      {
        heading: REVIEW_NOTICE,
        body: [],
      },
    ],
  },
  {
    slug: "corrections",
    title: "Corrections",
    summary: "How to report an error and how we handle corrections.",
    updated: UPDATED,
    sections: [
      {
        heading: "Report an error",
        body: [
          "Email corrections@americansignaldesk.com with the article URL, the specific passage, and what you believe is incorrect. Include supporting documentation where possible.",
        ],
      },
      {
        heading: "What happens next",
        body: [
          "An editor reviews the report and, where warranted, corrects the article. The correction is logged with a timestamp and the reason.",
          "Published articles keep an immutable revision history, so the original wording is always recoverable.",
        ],
      },
      {
        heading: "No corrections listed yet",
        body: ["This page lists corrections once the newsroom begins publishing."],
      },
    ],
  },
  {
    slug: "privacy",
    title: "Privacy Policy",
    summary: "What data we collect and why.",
    updated: UPDATED,
    sections: [
      {
        heading: "Data we collect",
        body: [
          "Newsletter subscribers: the email address you provide, plus a timestamp and the source page. We do not sell subscriber lists.",
          "Administrative users: name, email and role assignments, plus an append-only audit record of privileged actions taken in the admin panel.",
          "We do not store payment card data. Any payment processing is handled by a PCI-compliant provider on their own hosted pages.",
        ],
      },
      {
        heading: "Cookies",
        body: [
          "Administrative sessions use secure, HTTP-only cookies. Public pages do not require cookies for basic reading.",
          "Any analytics we add will be disclosed here before it is enabled.",
        ],
      },
      {
        heading: "Your rights",
        body: [
          "You can request access to, correction of, or deletion of your personal data by contacting us. Newsletter unsubscribes are processed immediately.",
        ],
      },
      { heading: REVIEW_NOTICE, body: [] },
    ],
  },
  {
    slug: "terms",
    title: "Terms of Service",
    summary: "The terms that govern use of this site.",
    updated: UPDATED,
    sections: [
      {
        heading: "Use of the site",
        body: [
          "You may read, link to and quote short excerpts of our reporting with attribution. Republishing full articles without written permission is not allowed.",
          "Automated scraping that degrades service, or attempts to access administrative areas, is prohibited.",
        ],
      },
      {
        heading: "Accounts",
        body: [
          "Administrative accounts are provisioned by invitation only. You are responsible for safeguarding your credentials and for enabling multi-factor authentication where offered.",
        ],
      },
      { heading: REVIEW_NOTICE, body: [] },
    ],
  },
  {
    slug: "cookies",
    title: "Cookie Policy",
    summary: "The cookies this site sets, and why.",
    updated: UPDATED,
    sections: [
      {
        heading: "Strictly necessary",
        body: [
          "Session cookies keep administrative users signed in. They are HTTP-only, SameSite-restricted, and marked secure in production. They cannot be used to track you across other sites.",
        ],
      },
      {
        heading: "Everything else",
        body: [
          "No advertising or third-party tracking cookies are set by the application as currently built. If that changes, this page changes first.",
        ],
      },
    ],
  },
  {
    slug: "disclaimer",
    title: "Disclaimer",
    summary: "Limits on the information published here.",
    updated: UPDATED,
    sections: [
      {
        heading: "Informational purpose",
        body: [
          "Content on this site is published for general information. It is not legal, medical, financial or professional advice, and should not be relied upon as a substitute for advice from a qualified professional.",
        ],
      },
      {
        heading: "Accuracy",
        body: [
          "We work to be accurate and to correct errors promptly, but we do not warrant that every article is free of error. See our corrections policy for how to raise a concern.",
        ],
      },
    ],
  },
];
