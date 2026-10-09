CREATE TABLE "plan_subscriptions" (
	"id" serial PRIMARY KEY,
	"workspace_id" text DEFAULT 'default' NOT NULL,
	"session_id" text NOT NULL UNIQUE,
	"plan" text DEFAULT 'lite' NOT NULL,
	"cycle" text DEFAULT 'monthly' NOT NULL,
	"machine_size" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"last_grant_month" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "coin_settings" ADD COLUMN "cvc_per_reply_milli" integer DEFAULT 1000 NOT NULL;--> statement-breakpoint
ALTER TABLE "coin_settings" ADD COLUMN "cvc_welcome_milli" integer DEFAULT 100000 NOT NULL;--> statement-breakpoint
ALTER TABLE "coin_settings" ADD COLUMN "accountant_can_mint_cvc" boolean DEFAULT true NOT NULL;