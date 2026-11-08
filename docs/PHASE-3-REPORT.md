# Phase 3 Report — Editorial CMS (article lifecycle)

**Date:** 2026-11-08
**Branch:** `arena/34196fc7-american-signal-desk`

---

## 1. এক নজরে (summary)

এই ধাপে **লেখা তৈরি → রিভিউ → অনুমোদন → প্রকাশ** পুরো প্রক্রিয়াটি তৈরি হয়েছে, এবং
পথে থাকা **তিনটি আসল নিরাপত্তা ত্রুটি** ঠিক করা হয়েছে — যেগুলো কোড পড়ে নয়, টেস্ট চালিয়ে
ধরা পড়েছে।

| যাচাই | ফলাফল |
| --- | --- |
| `npm run typecheck` | পাস, ০ ত্রুটি |
| `npm run lint` | পাস, ০ ওয়ার্নিং |
| `npm test` | **১০৭/১০৭ পাস** (৬ ফাইল, আগে ছিল ৭০) |
| `npm run build` | পাস, **২২ রুট** (আগে ১৭) |
| `/admin/login/mfa`, `/admin/login/reset` | আগে **404**, এখন 200 |
| `/admin/articles*` (লগইন ছাড়া) | 307 → `/admin/login` (সঠিকভাবে আটকায়) |

---

## 2. যে নিরাপত্তা ত্রুটিগুলো ধরা পড়েছে ও ঠিক হয়েছে

### ২.১ সর্বোচ্চ গুরুত্বপূর্ণ — Author সরাসরি প্রকাশ করতে পারত

`0002` মাইগ্রেশনের `articles_update` পলিসি শুধু *এডিট* অনুমতি দেখত, **স্ট্যাটাস দেখত না**।
Author-এর কাছে `article.edit.own` আছে, তাই সরাসরি `UPDATE articles SET status='published'`
চালিয়ে পুরো রিভিউ প্রসেস বাইপাস করা সম্ভব ছিল।

**সমাধান — তিন স্তরে (defence in depth):**

1. **TypeScript** — `permissionForStatus()`: প্রতিটি স্ট্যাটাসের জন্য আলাদা অনুমতি
   (`published` → `article.publish`)। এটি ছাড়া কোনো লেখা সেভ হয় না।
2. **Trigger** (`0003`) — `enforce_article_status_permission()`: RLS পুরনো ও নতুন মান
   তুলনা করতে পারে না, তাই ট্রিগার দিয়ে স্ট্যাটাস পরিবর্তনে অনুমতি যাচাই করা হয়।
3. **Column privilege** — `status`/`publish_at` ছাড়া বাকি কলামে UPDATE সীমিত।

টেস্ট: `tests/workflow-guards.test.ts` — Author-এর reachable সব অবস্থার গ্রাফ ঘুরে দেখা হয়
এবং প্রমাণ করা হয় `published`/`approved` কখনো পৌঁছানো যায় না।

### ২.২ Author অন্যের ড্রাফট রিভিউয়ে পাঠাতে পারত

`article.submit` অনুমতি আছে, কিন্তু মালিকানা যাচাই হচ্ছিল না। ফলে এক লেখক সহকর্মীর ড্রাফট
রিভিউ কিউতে ঠেলে দিতে পারতেন। **আমার নিজের লেখা টেস্ট এটি ধরেছে।**
সমাধান: `SUBMIT_LEVEL_PERMISSIONS` — `article.submit`/`article.create` শুধু *নিজের* লেখায়।

### ২.৩ `zod.url()` `javascript:` লিংক গ্রহণ করত

যাচাই করে দেখা গেছে (zod 4.6.7):

```
z.string().url().safeParse("javascript:alert(1)")  →  success: true
```

অর্থাৎ ছবির URL-এ `javascript:` বসিয়ে XSS করা সম্ভব ছিল।
সমাধান: `src/lib/validation/url.ts` — শুধু `http:`/`https:`, এবং URL-এ
username/password থাকলে প্রত্যাখ্যান (লগে সিক্রেট ফাঁস ঠেকাতে)।

### ২.৪ অন্যান্য

- `/admin/login/mfa` আর `/admin/login/reset` — লগইন ফর্ম এগুলোর লিংক দিচ্ছিল, কিন্তু পেজ
  ছিল না (404)। এখন তৈরি, TOTP যাচাই ও রিসেট অনুরোধ সহ।
- **বিভাগ (category) সেভ হত না** — ফর্ম slug পাঠাচ্ছিল, ডেটাবেস UUID আশা করে। ভ্যালিডেটর
  সঠিকভাবেই প্রত্যাখ্যান করত। এখন `listCategoriesForAdmin()` সত্যিকারের UUID দেয়।
- Next 16-এ `revalidateTag(tag)`-এর সিগনেচার বদলেছে (দ্বিতীয় আর্গুমেন্ট লাগে)। পাবলিক
  পেজগুলো path-based ISR ব্যবহার করে, তাই `revalidatePath` ব্যবহার করা হয়েছে — এবং
  revalidate হয় **লেখা সফলভাবে সেভ হওয়ার পরেই**, ব্যর্থ হলে নয়।

---

## 3. নতুন ফাইল

### পরিষেবা স্তর (service layer)
| ফাইল | কাজ |
| --- | --- |
| `src/server/editorial/service.ts` | সব লেখা-লেখার একক পথ: অনুমতি → ট্রানজিশন বৈধতা → মালিকানা → স্ট্যাটাস অনুমতি, তারপর লেখা। Optimistic concurrency (`.eq("status", …)`) দিয়ে দুজন এডিটর একসাথে "approve" করলে একজনেরই জেতে হয়। |
| `src/server/editorial/reading-time.ts` | পড়ার সময় হিসাব, DB constraint (১–১৮০) মেনে |
| `src/server/admin/categories.ts` | এডিটরের জন্য সত্যিকারের UUID |
| `src/lib/validation/article.ts` | Zod স্কিমা + `slugify` |
| `src/lib/validation/url.ts` | নিরাপদ http(s) URL |

### সার্ভার অ্যাকশন
`src/app/admin/articles/actions.ts` — `createArticleAction`, `updateArticleAction`,
`transitionArticleAction`, `signOutAction`। প্রতিটি নিজে সেশন দেখে, তারপর সার্ভিসে দেয়।
ব্রাউজার actor বা অনুমতি বদলাতে পারে না।

### UI
- `src/app/admin/articles/page.tsx` — তালিকা + স্ট্যাটাস ফিল্টার
- `src/app/admin/articles/new/page.tsx` — নতুন ড্রাফট
- `src/app/admin/articles/[id]/page.tsx` — এডিটর + শুধু অনুমোদিত ধাপের বোতাম
- `src/app/admin/articles/review/page.tsx` — রিভিউ কিউ (শুধু সম্পাদকদের জন্য)
- `src/components/admin/article-form.tsx` — শিরোনাম থেকে স্বয়ংক্রিয় slug, ফিল্ড-ভিত্তিক ত্রুটি
- `src/components/admin/transition-controls.tsx` — বিপজ্জনক কাজে নিশ্চিতকরণ
- `src/app/admin/login/mfa/` ও `src/app/admin/login/reset/`

### ডেটাবেস
- `supabase/migrations/0003_article_status_guard.sql` — উপরের ২.১ ও ২.২-এর DB স্তরের সুরক্ষা
- `supabase/tests/rls_article_workflow.sql` — ৮টি গ্রুপে লেখার জীবনচক্রের অনুমতি যাচাই

### টেস্ট
`tests/workflow-guards.test.ts` (১৬), `tests/article-validation.test.ts` (২১)

---

## 4. যা এখনো যাচাই হয়নি — এবং দাবি করছি না

- **কোনো মাইগ্রেশন কোনো ডেটাবেসে চালানো হয়নি।** `0001`, `0002`, `0003` — তিনটিই লেখা
  হয়েছে, প্রয়োগ হয়নি। এই sandbox থেকে কোনো PostgreSQL-এ পৌঁছানো যায় না।
- `supabase/tests/rls_article_workflow.sql` লেখা হয়েছে কিন্তু **কখনো চালানো হয়নি**।
  চালাতে `DATABASE_URL` দরকার: `npm run test:db`
- Supabase প্রকল্প না থাকায় **সাইন-ইন, সেশন, MFA — কোনোটাই বাস্তবে পরীক্ষিত নয়**।
- অ্যাডমিন পেজগুলো লগইন ছাড়া 307 দিয়ে আটকায় — এটা প্রমাণিত। কিন্তু লগইন করার পরে
  ভূমিকা অনুযায়ী কী দেখা যাবে, তা ডেটাবেস ছাড়া যাচাই করা সম্ভব নয়।

---

## 5. পরবর্তী ধাপ

1. Supabase প্রকল্প তৈরি + `0001`/`0002`/`0003` প্রয়োগ, তারপর RLS স্যুট চালানো (এখনো
   আপনার অনুমতির অপেক্ষায়)
2. সুপার অ্যাডমিন নিরাপদে তৈরি (invite + audited role grant)
3. মিডিয়া লাইব্রেরি ও `article_revisions` (সংশোধনের ইতিহাস)
4. BullMQ worker + Redis, তারপর এজেন্ট রেজিস্ট্রি ও API কী
