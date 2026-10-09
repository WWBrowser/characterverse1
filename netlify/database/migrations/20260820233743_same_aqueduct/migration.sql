CREATE TABLE "lattice_anchors" (
	"id" serial PRIMARY KEY,
	"chain_public_id" text DEFAULT '' NOT NULL,
	"h" integer DEFAULT 0 NOT NULL,
	"digest" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "lattice_chains" (
	"id" serial PRIMARY KEY,
	"session_id" text DEFAULT '' NOT NULL,
	"public_id" text NOT NULL UNIQUE,
	"name" text DEFAULT 'Untitled agent' NOT NULL,
	"birth_digest" text DEFAULT '' NOT NULL,
	"height" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "lattice_strata" (
	"id" serial PRIMARY KEY,
	"chain_public_id" text DEFAULT '' NOT NULL,
	"h" integer DEFAULT 0 NOT NULL,
	"parent" text DEFAULT '' NOT NULL,
	"moments" jsonb,
	"weights" jsonb,
	"capabilities" jsonb,
	"claims" jsonb,
	"budget" integer DEFAULT 0 NOT NULL,
	"math_digest" text DEFAULT '' NOT NULL,
	"reason_digest" text DEFAULT '' NOT NULL,
	"digest" text DEFAULT '' NOT NULL,
	"tick" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now()
);
