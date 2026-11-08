# ডিপ্লয় রেকর্ড — Vercel

এই ডকুমেন্টে শুধু সেই সব তথ্য আছে যেগুলো সত্যিই চালানো হয়েছে এবং টুল থেকে ফেরত পাওয়া গেছে।
কোনো আপটাইম, ট্রাফিক বা ব্যবহারকারীর সংখ্যা এখানে নেই — কারণ সেগুলো মাপা হয়নি।

---

## ১. যা তৈরি হয়েছে

| জিনিস | মান |
| --- | --- |
| Team | `Gemini Clone` (`gemini-clone`), plan `hobby` |
| Project | `american-signal-desk` — `prj_Dx6ZNLaB1oSXyb3XCavjS7gT2bwk` |
| Framework | Next.js 16.4.5 (Turbopack), Node 26.x |
| Function region | `iad1` (Washington, D.C.) |
| GitHub | `almoidfahad/American-Signal-Desk` (repoId `1450439861`) |
| Production alias | **https://american-signal-desk.vercel.app** |

Environment variables (ইনক্রিপ্টেড সেটিংসে রাখা, চ্যাটে কিছু পেস্ট করা হয়নি):

| Key | Type | Target |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | plain | production, preview |
| `NEXT_PUBLIC_SITE_NAME` | plain | production, preview |

> `NEXT_PUBLIC_*` ইচ্ছাকৃতভাবে ব্রাউজারে যায় — এগুলো গোপন কিছু নয়। Supabase service-role
> key, Redis URL, payment secret — এগুলোর **কোনোটিই** এখনো সেট করা হয়নি; সেগুলো কখনো
> `NEXT_PUBLIC_` হবে না।

## ২. ডিপ্লয়গুলো

| Deployment | Commit | ফলাফল |
| --- | --- | --- |
| `dpl_Bt5i1QiGZ4A5EqSH9BQ5a1PDwfTF` | `0bbee8b` (`main`) | READY, PROMOTED, 45.6s |
| `dpl_Bu2mgK3ja5crb4FZCHSvrR4GB2U1` | `c9c5fd1` | READY, PROMOTED, 18.6s |
| `dpl_9zdaSRKJg5JehntKyg1AkcmtbaNb` | `b22105f` | READY, PROMOTED, 18.7s — **বর্তমান প্রোডাকশন** |

তিনটি বিল্ডই সফল: `Compiled successfully`, `Build Completed`, 22টি রুট।

## ৩. প্রথমে যে ভুলটা করা হয়েছিল

প্রথম ডিপ্লয়টি `main` ব্রাঞ্চের `0bbee8b` থেকে বিল্ড হয়েছিল। ফলে মাইগ্রেশন ও RLS যাচাইয়ের
কাজ (কমিট `c9c5fd1`) লাইভ সাইটে ছিল না — শুধু ফিচার ব্রাঞ্চে পড়ে ছিল। দ্বিতীয় ডিপ্লয় দিয়ে
সেটি সংশোধন করা হয়েছে। শিক্ষা: `ref: main` মানে `main`-এ যা আছে ঠিক তা-ই, ব্রাঞ্চের নতুন
কাজ নয়।

## ৪. `/api/health`-এর সততা-ত্রুটি ও সংশোধন

প্রথম ডিপ্লয়ে এন্ডপয়েন্টটি ফেরত দিচ্ছিল:

```json
{"status":"ok",
 "checks":{"database":{"state":"not_configured"},
           "redis":{"state":"not_configured"}}}
```

`status` একটি হার্ডকোডেড লিটারেল ছিল। database আর cache — দুটোই কনফিগার না থাকা সত্ত্বেও
মনিটর সবুজ দেখাত। এটি ঠিক করা হয়েছে: স্ট্যাটাস এখন চেকগুলো থেকে গণনা করা হয়।

| অবস্থা | অর্থ | HTTP |
| --- | --- | --- |
| `degraded` | কোনো ডিপেন্ডেন্সি কনফিগারই নেই | 503 |
| `not_ready` | ক্রেডেনশিয়াল আছে, কিন্তু কখনো যাচাই হয়নি | 503 |
| `ok` | প্রতিটি চেক সত্যিই যাচাইকৃত | 200 |

লাইভ যাচাই (সংশোধনের পরে):

```
GET /api/health?cb=b22105f
→ {"status":"degraded", "checks":{"web":"ok","database":"not_configured","redis":"not_configured"}}
```

`tests/health.test.ts` এই আচরণটি পিন করে — বিশেষত "সব ডিপেন্ডেন্সি কনফিগার না থাকলে `ok`
নয়", যা পুরনো কোডে ব্যর্থ হতো।

## ৫. লাইভ রুট যাচাই (আসল ফলাফল)

`fetch_page` দিয়ে সরাসরি ফেচ করা হয়েছে:

| রুট | ফলাফল |
| --- | --- |
| `/` | 200 — "Content service is not configured" + ব্যাখ্যা |
| `/about` | 200 — সম্পূর্ণ কনটেন্ট |
| `/privacy` | 200 — সম্পূর্ণ কনটেন্ট |
| `/search` | 200 |
| `/admin` | `/admin/login`-এ রিডাইরেক্ট (সেশনবিহীন ব্যবহারকারী) |
| `/admin/login` | 200 — সাইন-ইন নিষ্ক্রিয়, ভুয়া বাইপাস নেই |
| `/robots.txt` | 200 — `/admin`, `/api/` ডিসঅ্যালাউ, sitemap নির্দেশ |
| `/sitemap.xml` | 200 — ১০টি পাবলিক রুট |
| `/api/health` | 503 `degraded` (সংশোধনের পর) |

## ৬. যা এখনো যাচাই হয়নি

- **স্যান্ডবক্স থেকে `curl` কাজ করে না** — `american-signal-desk.vercel.app`-এ TCP/SSL
  সংযোগ ব্যর্থ (`SSL_ERROR_SYSCALL`, status `000`)। স্যান্ডবক্সের আউটবাউন্ড অনুমতিতে
  Vercel নেই। উপরের যাচাই `fetch_page` দিয়ে হয়েছে। ⚠️ এটিকে সাইট-ডাউন হিসেবে পড়া যাবে না,
  আবার curl ব্যর্থতার ভিত্তিতে "সব ঠিক"ও বলা যাবে না।
- **লগইন/সেশন/MFA** — কোনো Supabase প্রজেক্ট নেই, তাই কোনো পরিবেশেই চালানো হয়নি।
- **RLS** — শুধু লোকাল PostgreSQL-এ চালানো; হোস্টেড Supabase-এ প্রয়োগ করা হয়নি (অনুমতি নেই)।
- **Redis, BullMQ, payments, AI** — বাস্তবায়িতই হয়নি; health এন্ডপয়েন্টও তাই `not_configured`
  বলে, বানিয়ে "ok" বলে না।

## ৭. পরের ধাপের আগে যে সিদ্ধান্ত দরকার

1. Supabase প্রজেক্ট তৈরি করা হবে কি? কোন রিজিয়নে? (সুপারিশ: `ap-southeast-1`)
2. মাইগ্রেশন কি এখনই হোস্টেড DB-তে প্রয়োগ করা হবে, নাকি রিভিউয়ের পরে?
3. Redis — Upstash নাকি আলাদা VPS?
4. ক্রেডিট ওয়ালেটের জন্য Stripe ব্যবহার করা হবে কি?
