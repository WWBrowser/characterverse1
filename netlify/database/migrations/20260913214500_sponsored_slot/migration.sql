-- Sponsored slot columns on search_entries.
--
-- These three columns are already created by 20260913214030_icy_rafael_vega,
-- which is the drizzle-generated migration for this schema change and carries
-- the snapshot.json that the next `drizzle-kit generate` will diff against.
-- This migration was written by hand for the same change and so ran second on
-- a branch where the columns already existed, failing with
--   pq: column "sponsored_until" of relation "search_entries" already exists (42701)
--
-- Made idempotent rather than emptied, so it is correct in both directions:
-- on an existing branch all three statements are no-ops, and on a branch built
-- from scratch it still produces the columns if it is ever the first of the
-- two to run. IF NOT EXISTS compares on column name only, which is exactly the
-- check that matters here because both migrations declare identical types.
ALTER TABLE "search_entries" ADD COLUMN IF NOT EXISTS "sponsored_until" timestamp;--> statement-breakpoint
ALTER TABLE "search_entries" ADD COLUMN IF NOT EXISTS "sponsor_milli" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "search_entries" ADD COLUMN IF NOT EXISTS "sponsor_note" text DEFAULT '' NOT NULL;
