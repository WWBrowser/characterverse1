CREATE TABLE "tabverse_cycles" (
	"id" serial PRIMARY KEY,
	"fork_id" integer NOT NULL,
	"cycle_index" integer DEFAULT 0 NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_utility" integer DEFAULT 0 NOT NULL,
	"ghost_files_recycled" integer DEFAULT 0 NOT NULL,
	"threats_burned" integer DEFAULT 0 NOT NULL,
	"threats_voided" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "tabverse_forks" (
	"id" serial PRIMARY KEY,
	"name" text NOT NULL,
	"org" text DEFAULT '' NOT NULL,
	"tabs" jsonb DEFAULT '[]' NOT NULL,
	"mode" text DEFAULT 'deterministic' NOT NULL,
	"creator_session" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "tabverse_cycles" ADD CONSTRAINT "tabverse_cycles_fork_id_tabverse_forks_id_fkey" FOREIGN KEY ("fork_id") REFERENCES "tabverse_forks"("id");