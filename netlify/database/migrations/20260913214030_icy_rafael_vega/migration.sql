ALTER TABLE "search_entries" ADD COLUMN "sponsored_until" timestamp;--> statement-breakpoint
ALTER TABLE "search_entries" ADD COLUMN "sponsor_milli" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "search_entries" ADD COLUMN "sponsor_note" text DEFAULT '' NOT NULL;