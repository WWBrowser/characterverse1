CREATE TABLE "search_entries" (
	"id" serial PRIMARY KEY,
	"session_id" text DEFAULT '' NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"tagline" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"url" text DEFAULT '' NOT NULL,
	"host" text DEFAULT '' NOT NULL,
	"frame" text DEFAULT 'oframe' NOT NULL,
	"provider" text DEFAULT '' NOT NULL,
	"icon" text DEFAULT '🛰️' NOT NULL,
	"category" text DEFAULT 'Assistant' NOT NULL,
	"tags" jsonb DEFAULT '[]' NOT NULL,
	"vibes" jsonb DEFAULT '[]' NOT NULL,
	"visibility" text DEFAULT 'public' NOT NULL,
	"status" text DEFAULT 'live' NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"opens" integer DEFAULT 0 NOT NULL,
	"dismissals" integer DEFAULT 0 NOT NULL,
	"frame_blocks" integer DEFAULT 0 NOT NULL,
	"last_opened_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "search_events" (
	"id" serial PRIMARY KEY,
	"session_id" text DEFAULT '' NOT NULL,
	"kind" text DEFAULT 'impression' NOT NULL,
	"entry_id" integer,
	"character_id" integer,
	"doc_kind" text DEFAULT '' NOT NULL,
	"query" text DEFAULT '' NOT NULL,
	"frame" text DEFAULT '' NOT NULL,
	"source" text DEFAULT 'search' NOT NULL,
	"rank" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "chat_tabs" ADD COLUMN "entry_id" integer;--> statement-breakpoint
ALTER TABLE "chat_tabs" ALTER COLUMN "character_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_tabs" ADD CONSTRAINT "chat_tabs_entry_id_search_entries_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "search_entries"("id");--> statement-breakpoint
ALTER TABLE "search_events" ADD CONSTRAINT "search_events_entry_id_search_entries_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "search_entries"("id");--> statement-breakpoint
ALTER TABLE "search_events" ADD CONSTRAINT "search_events_character_id_characters_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id");