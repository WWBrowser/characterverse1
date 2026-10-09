CREATE TABLE "spr_sessions" (
	"id" serial PRIMARY KEY,
	"session_id" text NOT NULL UNIQUE,
	"basis" text DEFAULT 'register' NOT NULL,
	"tier" text DEFAULT 'prism' NOT NULL,
	"gravity" integer DEFAULT 0 NOT NULL,
	"substrate" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "spr_superpositions" (
	"id" serial PRIMARY KEY,
	"session_id" text DEFAULT '' NOT NULL,
	"public_id" text NOT NULL UNIQUE,
	"prompt" text DEFAULT '' NOT NULL,
	"basis" text DEFAULT 'register' NOT NULL,
	"angles" jsonb,
	"ambiguity" jsonb,
	"state" text DEFAULT 'superposed' NOT NULL,
	"collapsed_key" text DEFAULT '' NOT NULL,
	"measurements" jsonb,
	"created_at" timestamp DEFAULT now()
);
