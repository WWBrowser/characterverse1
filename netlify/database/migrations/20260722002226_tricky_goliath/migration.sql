ALTER TABLE "social_shadow_logs" ADD COLUMN "facet" text DEFAULT 'reflection' NOT NULL;--> statement-breakpoint
ALTER TABLE "social_shadow_logs" ADD COLUMN "guide" text DEFAULT '' NOT NULL;