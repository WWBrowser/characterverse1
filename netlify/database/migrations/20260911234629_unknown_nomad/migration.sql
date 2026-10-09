ALTER TABLE "search_entries" ADD COLUMN "character_id" integer;--> statement-breakpoint
ALTER TABLE "search_entries" ADD COLUMN "permissions" jsonb DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE "search_entries" ADD COLUMN "embed_check" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "search_entries" ADD COLUMN "embed_detail" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "search_entries" ADD COLUMN "embed_status" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "search_entries" ADD COLUMN "embed_checked_at" timestamp;--> statement-breakpoint
ALTER TABLE "search_entries" ADD CONSTRAINT "search_entries_character_id_characters_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id");