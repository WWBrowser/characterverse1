CREATE TABLE "chatmarks" (
	"id" serial PRIMARY KEY,
	"conversation_id" integer NOT NULL,
	"character_id" integer NOT NULL,
	"session_id" text DEFAULT '' NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"character_tag" text DEFAULT '' NOT NULL,
	"job_tag" text DEFAULT '' NOT NULL,
	"division_tag" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "chatmarks" ADD CONSTRAINT "chatmarks_conversation_id_conversations_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id");--> statement-breakpoint
ALTER TABLE "chatmarks" ADD CONSTRAINT "chatmarks_character_id_characters_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id");