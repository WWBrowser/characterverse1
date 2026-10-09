CREATE TABLE "ask_bonus_grants" (
	"id" serial PRIMARY KEY,
	"workspace_id" text DEFAULT 'default' NOT NULL,
	"session_id" text NOT NULL UNIQUE,
	"amount_milli" integer DEFAULT 500 NOT NULL,
	"task" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "coin_ledger" (
	"id" serial PRIMARY KEY,
	"workspace_id" text DEFAULT 'default' NOT NULL,
	"session_id" text DEFAULT '' NOT NULL,
	"character_id" integer,
	"coin" text DEFAULT 'silver' NOT NULL,
	"amount_milli" integer DEFAULT 0 NOT NULL,
	"source" text DEFAULT 'chat' NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"ref_type" text DEFAULT '' NOT NULL,
	"ref_id" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "coin_settings" (
	"id" serial PRIMARY KEY,
	"workspace_id" text DEFAULT 'default' NOT NULL UNIQUE,
	"silver_price" integer DEFAULT 1 NOT NULL,
	"gold_price" integer DEFAULT 10 NOT NULL,
	"silver_rates" jsonb DEFAULT '{}' NOT NULL,
	"gold_rates" jsonb DEFAULT '{}' NOT NULL,
	"ask_bonus_milli" integer DEFAULT 500 NOT NULL,
	"pricing_mode" text DEFAULT 'fixed' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
