CREATE TABLE "chat_tabs" (
	"id" serial PRIMARY KEY,
	"session_id" text DEFAULT '' NOT NULL,
	"character_id" integer NOT NULL,
	"conversation_id" integer,
	"title" text DEFAULT '' NOT NULL,
	"from_recommendation" integer,
	"opener" text DEFAULT '' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "saa_recommendations" (
	"id" serial PRIMARY KEY,
	"slate_id" integer NOT NULL,
	"character_id" integer NOT NULL,
	"rank" integer DEFAULT 0 NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"scenario" text DEFAULT '' NOT NULL,
	"opener" text DEFAULT '' NOT NULL,
	"vibe_match" text DEFAULT '' NOT NULL,
	"match_score" integer DEFAULT 0 NOT NULL,
	"signals" jsonb,
	"axes" jsonb,
	"drafted" boolean DEFAULT false NOT NULL,
	"opened" boolean DEFAULT false NOT NULL,
	"dismissed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "saa_security_log" (
	"id" serial PRIMARY KEY,
	"session_id" text DEFAULT '' NOT NULL,
	"stage" text DEFAULT 'ingress' NOT NULL,
	"verdict" text DEFAULT 'allow' NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"input" text DEFAULT '' NOT NULL,
	"reasoning" text DEFAULT '' NOT NULL,
	"hits" jsonb,
	"policy" jsonb,
	"escalated" boolean DEFAULT false NOT NULL,
	"human_verdict" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "saa_slates" (
	"id" serial PRIMARY KEY,
	"session_id" text DEFAULT '' NOT NULL,
	"vibe" text DEFAULT '' NOT NULL,
	"seed" text DEFAULT '' NOT NULL,
	"read" jsonb,
	"provenance" text DEFAULT 'kernel' NOT NULL,
	"verdict" text DEFAULT 'allow' NOT NULL,
	"security_score" integer DEFAULT 0 NOT NULL,
	"candidates" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "chat_tabs" ADD CONSTRAINT "chat_tabs_character_id_characters_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id");--> statement-breakpoint
ALTER TABLE "chat_tabs" ADD CONSTRAINT "chat_tabs_conversation_id_conversations_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id");--> statement-breakpoint
ALTER TABLE "chat_tabs" ADD CONSTRAINT "chat_tabs_from_recommendation_saa_recommendations_id_fkey" FOREIGN KEY ("from_recommendation") REFERENCES "saa_recommendations"("id");--> statement-breakpoint
ALTER TABLE "saa_recommendations" ADD CONSTRAINT "saa_recommendations_slate_id_saa_slates_id_fkey" FOREIGN KEY ("slate_id") REFERENCES "saa_slates"("id");--> statement-breakpoint
ALTER TABLE "saa_recommendations" ADD CONSTRAINT "saa_recommendations_character_id_characters_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id");