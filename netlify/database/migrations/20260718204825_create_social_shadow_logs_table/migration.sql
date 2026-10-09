CREATE TABLE "social_shadow_logs" (
	"id" serial PRIMARY KEY,
	"member_id" integer NOT NULL,
	"character_id" integer NOT NULL,
	"reading" text DEFAULT '' NOT NULL,
	"suggestion" text DEFAULT '' NOT NULL,
	"signals" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "social_shadow_logs" ADD CONSTRAINT "social_shadow_logs_member_id_social_members_id_fkey" FOREIGN KEY ("member_id") REFERENCES "social_members"("id");--> statement-breakpoint
ALTER TABLE "social_shadow_logs" ADD CONSTRAINT "social_shadow_logs_character_id_characters_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id");