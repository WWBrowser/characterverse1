CREATE TABLE "bounties" (
	"id" serial PRIMARY KEY,
	"character_id" integer NOT NULL,
	"creator_session" text DEFAULT '' NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"brief" text DEFAULT '' NOT NULL,
	"reward_cc" integer DEFAULT 10 NOT NULL,
	"tester_limit" integer DEFAULT 5 NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "bounty_feedback" (
	"id" serial PRIMARY KEY,
	"bounty_id" integer NOT NULL,
	"character_id" integer NOT NULL,
	"tester_session" text DEFAULT '' NOT NULL,
	"rating" integer DEFAULT 3 NOT NULL,
	"category" text DEFAULT 'general' NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"awarded_cc" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "training_signals" (
	"id" serial PRIMARY KEY,
	"character_id" integer NOT NULL,
	"session_id" text DEFAULT '' NOT NULL,
	"kind" text NOT NULL,
	"sub_weight" text DEFAULT 'general' NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"mode" text DEFAULT 'realtime' NOT NULL,
	"weight" integer DEFAULT 1 NOT NULL,
	"applied" boolean DEFAULT false NOT NULL,
	"source_feedback_id" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "bounties" ADD CONSTRAINT "bounties_character_id_characters_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id");--> statement-breakpoint
ALTER TABLE "bounty_feedback" ADD CONSTRAINT "bounty_feedback_bounty_id_bounties_id_fkey" FOREIGN KEY ("bounty_id") REFERENCES "bounties"("id");--> statement-breakpoint
ALTER TABLE "bounty_feedback" ADD CONSTRAINT "bounty_feedback_character_id_characters_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id");--> statement-breakpoint
ALTER TABLE "training_signals" ADD CONSTRAINT "training_signals_character_id_characters_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id");