CREATE TABLE "art_pieces" (
	"id" serial PRIMARY KEY,
	"session_id" text DEFAULT '' NOT NULL,
	"station" text DEFAULT 'harmonic' NOT NULL,
	"seed_phrase" text DEFAULT '' NOT NULL,
	"seed_hash" text DEFAULT '' NOT NULL,
	"symmetry" integer DEFAULT 6 NOT NULL,
	"render_mode" text DEFAULT 'fixed' NOT NULL,
	"taken_as" text DEFAULT 'pour' NOT NULL,
	"size" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now()
);
