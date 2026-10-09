CREATE TABLE "coin_vaults" (
	"id" serial PRIMARY KEY,
	"workspace_id" text DEFAULT 'default' NOT NULL,
	"session_id" text NOT NULL UNIQUE,
	"sealed_until" timestamp,
	"soft_lock_until" timestamp,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
