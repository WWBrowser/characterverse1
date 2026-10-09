ALTER TABLE "saa_slates" ADD COLUMN "share_code" text;--> statement-breakpoint
ALTER TABLE "saa_slates" ADD COLUMN "shared_at" timestamp;--> statement-breakpoint
ALTER TABLE "saa_slates" ADD CONSTRAINT "saa_slates_share_code_key" UNIQUE("share_code");