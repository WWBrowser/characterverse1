CREATE TABLE "character_satellites" (
	"id" serial PRIMARY KEY,
	"character_id" integer NOT NULL,
	"session_id" text DEFAULT '' NOT NULL,
	"node" text NOT NULL,
	"designation" text DEFAULT '' NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"persona_override" text DEFAULT '' NOT NULL,
	"traits" jsonb DEFAULT '[]' NOT NULL,
	"metrics" jsonb DEFAULT '{}' NOT NULL,
	"status" text DEFAULT 'online' NOT NULL,
	"sync_withheld" boolean DEFAULT false NOT NULL,
	"last_sync_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "punk_records" (
	"id" serial PRIMARY KEY,
	"character_id" integer NOT NULL,
	"session_id" text DEFAULT '' NOT NULL,
	"node" text DEFAULT 'stella' NOT NULL,
	"kind" text DEFAULT 'reverse_action' NOT NULL,
	"target_node" text,
	"title" text DEFAULT '' NOT NULL,
	"knowledge" text DEFAULT '' NOT NULL,
	"metrics" jsonb DEFAULT '{}' NOT NULL,
	"source_ref" text,
	"weight" integer DEFAULT 1 NOT NULL,
	"sealed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "character_satellites" ADD CONSTRAINT "character_satellites_character_id_characters_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id");--> statement-breakpoint
ALTER TABLE "punk_records" ADD CONSTRAINT "punk_records_character_id_characters_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id");