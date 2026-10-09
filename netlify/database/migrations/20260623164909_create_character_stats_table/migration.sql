CREATE TABLE "character_stats" (
	"id" serial PRIMARY KEY,
	"character_id" integer NOT NULL UNIQUE,
	"chat_msgs" integer DEFAULT 0 NOT NULL,
	"claw_msgs" integer DEFAULT 0 NOT NULL,
	"conference_msgs" integer DEFAULT 0 NOT NULL,
	"app_connections" jsonb DEFAULT '[]' NOT NULL,
	"external_platforms" jsonb DEFAULT '[]' NOT NULL,
	"is_private" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "character_stats" ADD CONSTRAINT "character_stats_character_id_characters_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id");