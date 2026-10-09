CREATE TABLE "training_cycles" (
	"id" serial PRIMARY KEY,
	"workspace_id" text DEFAULT 'default' NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"slug" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"is_genesis" boolean DEFAULT false NOT NULL,
	"environment" text DEFAULT 'sandbox' NOT NULL,
	"training_mode" text DEFAULT 'standard' NOT NULL,
	"status" text DEFAULT 'dormant' NOT NULL,
	"phase" text DEFAULT 'drift' NOT NULL,
	"consolidation_epochs" integer DEFAULT 0 NOT NULL,
	"dyad_pairing" text DEFAULT 'AI · Human' NOT NULL,
	"anchor_hash" text DEFAULT '' NOT NULL,
	"entry_criteria" jsonb DEFAULT '{}' NOT NULL,
	"enrolled" jsonb DEFAULT '[]' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
