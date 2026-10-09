CREATE TABLE "chunk_benches" (
	"id" serial PRIMARY KEY,
	"session_id" text DEFAULT '' NOT NULL,
	"public_id" text NOT NULL UNIQUE,
	"title" text DEFAULT 'Untitled bench' NOT NULL,
	"slot" text DEFAULT 'body' NOT NULL,
	"seed" jsonb,
	"head" jsonb,
	"body" jsonb,
	"tail" jsonb,
	"converged" boolean DEFAULT false NOT NULL,
	"preserved" integer DEFAULT 0 NOT NULL,
	"seal_digest" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "chunk_frames" (
	"id" serial PRIMARY KEY,
	"bench_public_id" text DEFAULT '' NOT NULL,
	"n" integer DEFAULT 0 NOT NULL,
	"chunk_public_id" text DEFAULT '' NOT NULL,
	"lane" text DEFAULT 'body' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"outcomes" integer DEFAULT 0 NOT NULL,
	"digest" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "code_chunks" (
	"id" serial PRIMARY KEY,
	"session_id" text DEFAULT '' NOT NULL,
	"public_id" text NOT NULL UNIQUE,
	"kind" text DEFAULT 'unknown' NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"source" text DEFAULT '' NOT NULL,
	"binds_in" jsonb,
	"binds_out" jsonb,
	"terminal" boolean DEFAULT false NOT NULL,
	"depth" integer DEFAULT 0 NOT NULL,
	"line_start" integer DEFAULT 0 NOT NULL,
	"line_end" integer DEFAULT 0 NOT NULL,
	"fingerprint" text DEFAULT '' NOT NULL,
	"shape" text DEFAULT '' NOT NULL,
	"origin" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
