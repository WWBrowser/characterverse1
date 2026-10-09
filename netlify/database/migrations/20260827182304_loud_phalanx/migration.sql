CREATE TABLE "art_discoveries" (
	"id" serial PRIMARY KEY,
	"claim_key" text NOT NULL UNIQUE,
	"station" text DEFAULT '' NOT NULL,
	"seed_phrase" text DEFAULT '' NOT NULL,
	"seed_hash" text DEFAULT '' NOT NULL,
	"symmetry" integer DEFAULT 0 NOT NULL,
	"tier" text DEFAULT 'sub-discovery' NOT NULL,
	"discoverer" text DEFAULT '' NOT NULL,
	"assisted" boolean DEFAULT false NOT NULL,
	"session_id" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "art_pieces" ADD COLUMN "discoverer" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "art_pieces" ADD COLUMN "assisted" boolean DEFAULT false NOT NULL;