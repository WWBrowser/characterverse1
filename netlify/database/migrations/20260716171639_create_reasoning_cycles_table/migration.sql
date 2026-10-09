CREATE TABLE "reasoning_cycles" (
	"id" serial PRIMARY KEY,
	"workspace_id" text DEFAULT 'default' NOT NULL,
	"character_id" integer NOT NULL,
	"session_id" text DEFAULT '' NOT NULL,
	"task" text DEFAULT '' NOT NULL,
	"cost_budget" integer DEFAULT 100 NOT NULL,
	"cost_burned" integer DEFAULT 0 NOT NULL,
	"outcome" text DEFAULT 'completed' NOT NULL,
	"sub_weight" text DEFAULT 'general' NOT NULL,
	"pol" integer DEFAULT 0 NOT NULL,
	"gold_milli" integer DEFAULT 0 NOT NULL,
	"gate" jsonb DEFAULT '{}' NOT NULL,
	"signal_id" integer,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "reasoning_cycles" ADD CONSTRAINT "reasoning_cycles_character_id_characters_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id");