CREATE TABLE "characters" (
	"id" serial PRIMARY KEY,
	"name" text NOT NULL,
	"tagline" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"persona" text DEFAULT '' NOT NULL,
	"greeting" text DEFAULT '' NOT NULL,
	"avatar" text DEFAULT '🤖' NOT NULL,
	"category" text DEFAULT 'General' NOT NULL,
	"creator_session" text DEFAULT '' NOT NULL,
	"is_public" boolean DEFAULT true NOT NULL,
	"total_chats" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" serial PRIMARY KEY,
	"character_id" integer NOT NULL,
	"session_id" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY,
	"conversation_id" integer NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_character_id_characters_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id");--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id");