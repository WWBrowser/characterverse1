CREATE TABLE "social_adoptions" (
	"id" serial PRIMARY KEY,
	"member_id" integer NOT NULL,
	"character_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "social_members" ADD COLUMN "agent_shadowing" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "social_adoptions" ADD CONSTRAINT "social_adoptions_member_id_social_members_id_fkey" FOREIGN KEY ("member_id") REFERENCES "social_members"("id");--> statement-breakpoint
ALTER TABLE "social_adoptions" ADD CONSTRAINT "social_adoptions_character_id_characters_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id");