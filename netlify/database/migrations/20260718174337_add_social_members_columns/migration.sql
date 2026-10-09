ALTER TABLE "social_members" ADD COLUMN "want_to_meet" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "social_members" ADD COLUMN "custom_css" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "social_members" ADD COLUMN "is_private" boolean DEFAULT false NOT NULL;