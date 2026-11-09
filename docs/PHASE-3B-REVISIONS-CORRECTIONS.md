# Phase 3b — সংশোধনের ইতিহাস, সংশোধন-লেজার, মিডিয়া লাইব্রেরি ও মন্তব্য

তারিখ: ২০২৬-১১-০৮ · ব্রাঞ্চ `arena/7401e56b-american-signal-desk`

---

## ১. কেন এই কাজ

`0002` মাইগ্রেশনের মন্তব্যে লেখা ছিল: *"Article revisions, review records, tags/media, and
comments land in 0003"*। কিন্তু `0003` হয়ে গিয়েছিল status-প্রিভিলেজ ফিক্স, তাই ওই টেবিলগুলো
**কখনো তৈরি হয়নি**।

সমস্যাটা কেবল "ফিচার বাকি" নয়। `/corrections` পেজটা পাঠকদের সরাসরি বলছিল:

> "Published articles keep an immutable revision history, so the original wording is always
> recoverable."

এটা **মিথ্যা ছিল**। এডিটর প্রকাশিত লেখা বদলালে আগের লেখা চিরতরে হারিয়ে যেত। একটা
সংবাদপত্রের ক্ষেত্রে এটা "সংশোধন নীতি" আর "সংশোধন নীতির দাবি"-র মধ্যে পার্থক্য। তাই ঠিক
করার পথ একটাই ছিল — বাক্যটা সত্যি বানানো, ডকুমেন্ট থেকে মুছে ফেলা নয়।

## ২. যা তৈরি হয়েছে

### `supabase/migrations/0004_revisions_media_comments.sql`

| টেবিল | উদ্দেশ্য |
|---|---|
| `article_revisions` | লেখার অপরিবর্তনীয় ইতিহাস — প্রতি write-এ এক রো |
| `corrections` | পাবলিক সংশোধন-লেজার, মুছে ফেলা যায় না |
| `article_reviews` | কে অনুমোদন/প্রত্যাখ্যান করল, কেন |
| `media_assets` | মিডিয়া লাইব্রেরি, alt text বাধ্যতামূলক |
| `article_media` | আর্টিকেল ↔ মিডিয়া সংযোগ |
| `comments` | পাঠকের মন্তব্য, প্রকাশের আগে মডারেশন |

সাথে: `public_corrections` ভিউ (`security_invoker`), নতুন পারমিশন `correction.publish`।

### ডিজাইন সিদ্ধান্ত — এবং কেন

**১. রিভিশন ট্রিগার লেখে, অ্যাপ্লিকেশন নয়।** সার্ভিস লেয়ার রিভিশন লিখতে ভুলে গেলে ইতিহাস
অসম্পূর্ণ হবে। ট্রিগার-চালিত ইতিহাস ঠিক তখনই টেকে যখন বাগটা আকর্ষণীয় — অর্থাৎ যখনই কিছু
ভাঙে।

**২. এক রো = পরিবর্তনের *পরে* অবস্থা।** প্রথমে ভেবেছিলাম "আগের" অবস্থা সংরক্ষণ করব। ব্যবহারিক
পরীক্ষায় দেখা গেল এতে প্রতি এডিটে **দুইটা** রো তৈরি হয়, আর স্ট্যাটাস বদলালে টেবিলে লেখা হয়
পুরনো স্ট্যাটাস — ফলে "এই মুহূর্তে আর্টিকেলটা কী বলছে" প্রশ্নের উত্তর টেবিলে থাকে না। এখন
সর্বোচ্চ `revision_no` সবসময় লাইভ লেখা, আর আগের রো-ই মূল লেখা। এডিটে এক রো, নো-অপ write-এ
শূন্য রো।

**৩. নীরব সংশোধন অসম্ভব।** `corrections`-এ `is_public` true হলে `approved_by` ও `approved_at`
বাধ্যতামূলক (CHECK constraint)। আর `delete` ব্লক করা — তাই প্রকাশিত সংশোধন চুপচাপ প্রত্যাহারও
করা যায় না।

**৪. append-only দুই স্তরে**, `audit_logs`-এর প্রমাণিত প্যাটার্ন অনুসারে: RLS-এ UPDATE/DELETE
পলিসি নেই, এবং ট্রিগারে `block_mutation()`।

**৫. পাবলিক রিড শুধু দুটোই:** প্রকাশিত আর্টিকেলের পাবলিক সংশোধন, এবং অনুমোদিত মন্তব্য। বাকি
সব staff-only।

## ৩. যে পরীক্ষাগুলো সত্যিই কিছু প্রমাণ করে

`supabase/tests/rls_revisions_corrections.sql` — ১৪টি সেকশন।

শুধু "পাস করেছে" বলাই যথেষ্ট নয়, তাই **দুবার ইচ্ছাকৃতভাবে ভেঙে** দেখা হয়েছে:

| যা সরানো হলো | suite-এর প্রতিক্রিয়া |
|---|---|
| `article_revisions_append_only` ট্রিগার | `ASSERTION FAILED: the append-only trigger must reject an owner-level UPDATE` |
| `articles_capture_revision` ট্রিগার | `ASSERTION FAILED: creating an article must write revision 1` |

অর্থাৎ টেস্টগুলো আসলে রক্ষা করছে, সাজসজ্জা নয়।

### লেখার সময় পাওয়া তিনটি আসল সমস্যা

1. **`OLD` ব্যবহার INSERT-এ ভুল ফল দেয়** — `coalesce(old.title, new.title)` INSERT-এ কাজ
   করলেও ডিজাইনটা বিভ্রান্তিকর ছিল (উপরে সিদ্ধান্ত ২ দেখুন)।
2. **super admin-এর UPDATE-এ RLS নীরব** — পলিসি না থাকায় ০ রো মেলে, কোনো এরর নেই। তাই
   "এরর আশা করা" ভুল পরীক্ষা ছিল; আসল প্রমাণ — রো-টা বদলায়নি। এটা `audit_logs`-এ আগে শেখা
   একই সূক্ষ্মতা।
3. **`column reference "body_html" is ambiguous`** — ভিউ/জয়েনে alias ছাড়া কলাম নাম।

## ৪. একটি রিগ্রেশন যা বিল্ড পাস করেও লাইভে ভাঙা ছিল

`/corrections` পেজটা প্রথমে `[...policy]` catch-all-এর ভেতরে রাখা হয়েছিল। ওই রুটে
`dynamicParams = false` আছে, আর corrections-এর লাইভ ডেটা দরকার।

- `npm run build` → **সফল**
- সব টেস্ট → **পাস**
- `next start` → `/corrections` = **404**

অথচ এই পেজটা sitemap, robots.txt আর ফুটার থেকে লিংক করা। কারণ: সব path প্রি-রেন্ডার হয়ে
গিয়েছিল, ফলে কোনো fallback-ই ছিল না।

**সমাধান:** corrections-এর নিজস্ব রুট `(public)/corrections`, `dynamic = "force-dynamic"`
সহ। এখন বিল্ড আউটপুটে স্পষ্ট দেখা যায়: `ƒ /corrections`।

প্রোডাকশন সার্ভারে (`next start`) যাচাই:

```
/corrections         → 200
/privacy             → 200
/terms               → 200
/cookies             → 200
/disclaimer          → 200
/editorial-standards → 200
/about               → 200
/not-a-policy        → 404   (catch-all এখনো কেবল বৈধ slug সার্ভ করে)
```

## ৫. সৎ-অবস্থার নীতি কোডে প্রয়োগ

`getPublicCorrections()` তিনটি আলাদা অবস্থা ফেরত দেয়:

| অবস্থা | অর্থ | পেজে যা দেখায় |
|---|---|---|
| `live` | লেজার পড়া গেছে, সংশোধন আছে | তালিকা |
| `empty` | লেজার পড়া গেছে, সত্যিই শূন্য | "No corrections have been published" |
| `unavailable` | লেজার **পড়া যায়নি** | সতর্কবার্তা |

শেষ দুটো কখনো এক করা যাবে না — নাহলে ডেটাবেস আউটেজ পাঠকদের কাছে দেখাবে "এই সংবাদপত্রের
কখনো সংশোধনের দরকার হয়নি"। `tests/corrections.test.ts` এই পার্থক্যটাই পিন করে।

লোকাল `next start`-এ (ডেটাবেস নেই) পেজ এখন দেখায় **"Corrections are temporarily
unavailable"** — খালি তালিকা নয়।

## ৬. যা চালানো হয়েছে (আসল ফল)

```
npm run typecheck  → pass
npm run lint       → pass (0 warnings)
npm test           → 130 passed (9 files)
npm run build      → pass; 24 routes; ƒ /corrections dynamic
npm run test:db    → 4 migrations applied + 3 RLS suites passed (PostgreSQL 16.2)
```

মাইগ্রেশন **প্রয়োগ হয়েছে শুধু লোকাল PostgreSQL-এ** (`asd_final` ডেটাবেস)। কোনো হোস্টেড
Supabase-এ নয় — সেটার অনুমতি এখনো দেওয়া হয়নি।

## ৭. যা এখনো বাকি

- `article_revisions` / `corrections` পড়ার অ্যাডমিন UI (সার্ভিস লেয়ার তৈরি, পেজ বাকি)
- মিডিয়া লাইব্রেরির আপলোড UI + Supabase Storage bucket নীতি
- মন্তব্য মডারেশনের অ্যাডমিন স্ক্রিন ও পাবলিক সাবমিশন endpoint (rate limit সহ)
- `article_reviews` সার্ভিস লেয়ার — এখন টেবিল ও পলিসি আছে, কেউ লেখে না
- হোস্টেড Supabase প্রজেক্টে মাইগ্রেশন প্রয়োগ (অনুমতি প্রয়োজন)
