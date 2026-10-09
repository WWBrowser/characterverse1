CREATE TABLE "audit_trims" (
	"id" serial PRIMARY KEY,
	"conversation_id" integer NOT NULL,
	"character_id" integer NOT NULL,
	"session_id" text DEFAULT '' NOT NULL,
	"kept_count" integer DEFAULT 0 NOT NULL,
	"trimmed_messages" jsonb DEFAULT '[]' NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"hidden_gem" boolean DEFAULT false NOT NULL,
	"gem_note" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "enterprise_settings" (
	"id" serial PRIMARY KEY,
	"workspace_id" text DEFAULT 'default' NOT NULL UNIQUE,
	"org_name" text DEFAULT 'Your Organization' NOT NULL,
	"seats" integer DEFAULT 100 NOT NULL,
	"file_chat_access" text DEFAULT 'open' NOT NULL,
	"stuck_threshold_mins" integer DEFAULT 50 NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "audit_trims" ADD CONSTRAINT "audit_trims_conversation_id_conversations_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id");--> statement-breakpoint
ALTER TABLE "audit_trims" ADD CONSTRAINT "audit_trims_character_id_characters_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id");