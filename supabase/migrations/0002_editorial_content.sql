-- =============================================================================
-- 0002 — Editorial content: categories, authors, articles, breaking news,
--        newsletter subscriptions, and the public read surface.
-- =============================================================================
-- Scope note: this migration covers exactly the tables the public site and the
-- admin dashboard read today. Article revisions, review records, tags/media,
-- and comments land in 0003 with their own tests, rather than being half-built
-- here and discovered broken later.
--
-- Public reads go through `published_articles`, a security_invoker view, so the
-- underlying RLS on `articles` still applies. The application never selects draft
-- bodies; the view cannot expose them, which is defence in depth.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Enumerations
-- -----------------------------------------------------------------------------
do $$ begin
  create type public.article_status as enum (
    'draft', 'pending_review', 'changes_requested', 'approved',
    'scheduled', 'published', 'rejected', 'archived', 'trash'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.subscription_status as enum ('pending', 'confirmed', 'unsubscribed', 'bounced');
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- categories
-- -----------------------------------------------------------------------------
create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  description text not null default '',
  is_active   boolean not null default true,
  sort_order  integer not null default 100,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint categories_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint categories_name_len check (char_length(name) between 1 and 80)
);

create index if not exists categories_active_order_idx on public.categories (is_active, sort_order);

-- -----------------------------------------------------------------------------
-- authors
-- -----------------------------------------------------------------------------
create table if not exists public.authors (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references public.profiles (id) on delete set null,
  slug         text not null unique,
  display_name text not null,
  role_title   text not null default 'Reporter',
  bio          text not null default '',
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  constraint authors_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

create index if not exists authors_user_idx on public.authors (user_id);

-- -----------------------------------------------------------------------------
-- articles
-- -----------------------------------------------------------------------------
create table if not exists public.articles (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique,
  title            text not null,
  dek              text not null default '',
  body_html        text not null default '',
  status           public.article_status not null default 'draft',
  category_id      uuid references public.categories (id) on delete restrict,
  author_id        uuid references public.authors (id) on delete set null,
  -- Author of record, used for "edit your own draft" ownership checks.
  created_by       uuid references public.profiles (id) on delete set null,
  publish_at       timestamptz,
  reading_minutes  integer not null default 3,
  hero_image_url   text,
  hero_image_alt   text,
  is_exclusive     boolean not null default false,
  ai_assisted      boolean not null default false,
  ai_reviewed_by   uuid references public.profiles (id) on delete set null,
  ai_reviewed_at   timestamptz,
  -- Soft delete. Rows are never hard-deleted from the admin UI; only a super admin
  -- with article.purge may remove them, and that action is audited.
  deleted_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint articles_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint articles_title_len check (char_length(title) between 1 and 300),
  constraint articles_reading_minutes check (reading_minutes between 1 and 180),
  -- A published article must have a publish timestamp: the public view depends on it.
  constraint articles_published_needs_date
    check (status <> 'published' or publish_at is not null),
  constraint articles_scheduled_needs_future
    check (status <> 'scheduled' or publish_at is not null)
);

create index if not exists articles_slug_idx on public.articles (slug);
create index if not exists articles_status_publish_idx on public.articles (status, publish_at desc);
create index if not exists articles_category_idx on public.articles (category_id, publish_at desc);
create index if not exists articles_author_idx on public.articles (author_id, publish_at desc);
create index if not exists articles_created_by_idx on public.articles (created_by);
create index if not exists articles_updated_idx on public.articles (updated_at desc);

-- Full-text search index. Generated column keeps it in sync automatically.
alter table public.articles
  add column if not exists search_vector tsvector
  generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(dek, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(body_html, '')), 'C')
  ) stored;

create index if not exists articles_search_idx on public.articles using gin (search_vector);

drop trigger if exists articles_touch on public.articles;
create trigger articles_touch before update on public.articles
  for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Row Level Security on articles
-- -----------------------------------------------------------------------------
alter table public.articles   enable row level security;
alter table public.categories enable row level security;
alter table public.authors    enable row level security;

-- Public may read only published, not-deleted articles.
drop policy if exists articles_public_read on public.articles;
create policy articles_public_read on public.articles
  for select to anon, authenticated
  using (status = 'published' and deleted_at is null and publish_at <= now());

-- Staff may read everything they are entitled to see.
drop policy if exists articles_staff_read on public.articles;
create policy articles_staff_read on public.articles
  for select to authenticated
  using (
    public.has_permission('article.review')
    or public.has_permission('article.edit.any')
    or created_by = auth.uid()
  );

-- Creating an article requires article.create, and you must own what you create.
drop policy if exists articles_insert on public.articles;
create policy articles_insert on public.articles
  for insert to authenticated
  with check (public.has_permission('article.create') and created_by = auth.uid());

-- Editing: edit.any holders may edit anything; edit.own holders may edit only their own.
drop policy if exists articles_update on public.articles;
create policy articles_update on public.articles
  for update to authenticated
  using (
    public.has_permission('article.edit.any')
    or (public.has_permission('article.edit.own') and created_by = auth.uid())
  )
  with check (
    public.has_permission('article.edit.any')
    or (public.has_permission('article.edit.own') and created_by = auth.uid())
  );

-- No DELETE policy at all: deletion is a status change (soft delete), which keeps the
-- public archive and the audit trail intact. Permanent purge runs as the service role
-- after an audited article.purge check in the service layer.

-- categories / authors: public read of active rows; management requires permission.
drop policy if exists categories_public_read on public.categories;
create policy categories_public_read on public.categories
  for select to anon, authenticated using (is_active = true);

drop policy if exists categories_manage on public.categories;
create policy categories_manage on public.categories
  for all to authenticated
  using (public.has_permission('category.manage'))
  with check (public.has_permission('category.manage'));

drop policy if exists authors_public_read on public.authors;
create policy authors_public_read on public.authors
  for select to anon, authenticated using (is_active = true);

drop policy if exists authors_manage on public.authors;
create policy authors_manage on public.authors
  for all to authenticated
  using (public.has_permission('user.manage') or public.has_permission('article.edit.any'))
  with check (public.has_permission('user.manage') or public.has_permission('article.edit.any'));

-- -----------------------------------------------------------------------------
-- published_articles — the only read surface the public site uses
-- -----------------------------------------------------------------------------
-- security_invoker means the caller's RLS applies to the base table, so this view can
-- never become an accidental bypass if someone later forgets a policy.
drop view if exists public.published_articles;
create view public.published_articles
with (security_invoker = true)
as
select
  a.slug,
  a.title,
  a.dek,
  a.body_html,
  a.publish_at,
  a.reading_minutes,
  a.hero_image_url,
  a.hero_image_alt,
  a.is_exclusive,
  a.ai_assisted,
  a.updated_at,
  c.slug as category_slug,
  c.name as category_name,
  au.slug as author_slug,
  au.display_name as author_name,
  au.role_title as author_role,
  au.bio as author_bio
from public.articles a
left join public.categories c on c.id = a.category_id
left join public.authors au on au.id = a.author_id
where a.status = 'published'
  and a.deleted_at is null
  and a.publish_at is not null
  and a.publish_at <= now();

comment on view public.published_articles is
  'Public read surface. security_invoker so base-table RLS always applies.';

-- -----------------------------------------------------------------------------
-- search_articles — full-text search without pulling rows into the app
-- -----------------------------------------------------------------------------
create or replace function public.search_articles(q text, max_rows integer default 30)
returns table (
  slug text,
  title text,
  dek text,
  category_slug text,
  category_name text,
  publish_at timestamptz,
  reading_minutes integer,
  hero_image_url text,
  hero_image_alt text,
  ai_assisted boolean
)
language sql
stable
security invoker
set search_path = pg_catalog, public, extensions
as $$
  select
    a.slug, a.title, a.dek,
    c.slug, c.name,
    a.publish_at, a.reading_minutes,
    a.hero_image_url, a.hero_image_alt,
    a.ai_assisted
  from public.articles a
  left join public.categories c on c.id = a.category_id
  where a.status = 'published'
    and a.deleted_at is null
    and a.publish_at <= now()
    and (nullif(trim(q), '') is null or a.search_vector @@ websearch_to_tsquery('english', q))
  order by
    ts_rank(a.search_vector, websearch_to_tsquery('english', nullif(trim(q), ''))) desc nulls last,
    a.publish_at desc
  limit least(coalesce(max_rows, 30), 100);
$$;

-- -----------------------------------------------------------------------------
-- breaking_news
-- -----------------------------------------------------------------------------
create table if not exists public.breaking_news (
  id         uuid primary key default gen_random_uuid(),
  headline   text not null,
  href       text not null default '/',
  is_active  boolean not null default true,
  -- `started_at` orders the ticker; `starts_at`/`ends_at` bound its display window.
  started_at timestamptz not null default now(),
  starts_at  timestamptz not null default now(),
  ends_at    timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint breaking_headline_len check (char_length(headline) between 1 and 200),
  constraint breaking_href_local check (href ~ '^/'),
  constraint breaking_window check (ends_at is null or ends_at > starts_at)
);

create index if not exists breaking_active_idx on public.breaking_news (is_active, started_at desc);

alter table public.breaking_news enable row level security;

drop policy if exists breaking_public_read on public.breaking_news;
create policy breaking_public_read on public.breaking_news
  for select to anon, authenticated using (is_active = true);

drop policy if exists breaking_manage on public.breaking_news;
create policy breaking_manage on public.breaking_news
  for all to authenticated
  using (public.has_permission('article.publish'))
  with check (public.has_permission('article.publish'));

-- -----------------------------------------------------------------------------
-- newsletter_subscriptions
-- -----------------------------------------------------------------------------
create table if not exists public.newsletter_subscriptions (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique,
  status        public.subscription_status not null default 'pending',
  source        text not null default 'website',
  confirm_token text,
  confirmed_at  timestamptz,
  unsubscribed_at timestamptz,
  created_at    timestamptz not null default now(),
  constraint newsletter_email_lower check (email = lower(email)),
  constraint newsletter_email_shape check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);

create index if not exists newsletter_status_idx on public.newsletter_subscriptions (status, created_at desc);

alter table public.newsletter_subscriptions enable row level security;
-- No policies: this table is written and read exclusively by the service role
-- (URL handler / worker). Subscribers must never be able to list each other.

-- -----------------------------------------------------------------------------
-- Seed categories
-- -----------------------------------------------------------------------------
insert into public.categories (slug, name, description, sort_order) values
  ('us-news',       'U.S. News',      'National affairs and policy.', 10),
  ('politics',      'Politics',       'Campaigns, Congress and the White House.', 20),
  ('world',         'World',          'International reporting.', 30),
  ('business',      'Business',       'Markets, companies and the economy.', 40),
  ('economy',       'Economy',        'Growth, jobs, inflation and trade.', 45),
  ('technology',    'Technology',     'Innovation and digital policy.', 50),
  ('health',        'Health',         'Public health and medicine.', 60),
  ('science',       'Science',        'Research and discovery.', 70),
  ('education',     'Education',      'Schools, universities and policy.', 80),
  ('environment',   'Environment',    'Climate, energy and conservation.', 90),
  ('crime-justice', 'Crime & Justice', 'Courts, policing and public safety.', 100),
  ('sports',        'Sports',         'Scores, leagues and the people behind them.', 110),
  ('entertainment', 'Entertainment',  'Culture and media.', 120),
  ('opinion',       'Opinion',        'Analysis and argument.', 130)
on conflict (slug) do nothing;
