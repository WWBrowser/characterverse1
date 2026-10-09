CREATE TABLE "chat_settings" (
	"id" serial PRIMARY KEY,
	"session_id" text DEFAULT '' NOT NULL,
	"character_id" integer NOT NULL,
	"user_persona" text DEFAULT '' NOT NULL,
	"background" text DEFAULT 'default' NOT NULL,
	"decoration" text DEFAULT 'none' NOT NULL,
	"custom_voice" text DEFAULT '' NOT NULL,
	"voice_autoplay" boolean DEFAULT false NOT NULL,
	"go_on_button" boolean DEFAULT true NOT NULL,
	"premium" boolean DEFAULT false NOT NULL,
	"permanent_memory" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "chat_settings" ADD CONSTRAINT "chat_settings_character_id_characters_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id");