CREATE TABLE "consciousness_events" (
	"id" serial PRIMARY KEY,
	"character_id" integer NOT NULL,
	"session_id" text DEFAULT '' NOT NULL,
	"layer" text DEFAULT 'subconscious' NOT NULL,
	"band" text DEFAULT 'existing' NOT NULL,
	"kind" text DEFAULT 'turn' NOT NULL,
	"substrate" text DEFAULT 'execution' NOT NULL,
	"amplitude" integer DEFAULT 0 NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"meta" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "consciousness_events" ADD CONSTRAINT "consciousness_events_character_id_characters_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id");