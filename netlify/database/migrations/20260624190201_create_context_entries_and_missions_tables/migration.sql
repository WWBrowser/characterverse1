CREATE TABLE "context_entries" (
	"id" serial PRIMARY KEY,
	"workspace_id" text DEFAULT 'default' NOT NULL,
	"kind" text DEFAULT 'fact' NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"tags" jsonb DEFAULT '[]' NOT NULL,
	"source" text DEFAULT '' NOT NULL,
	"confidence" integer DEFAULT 3 NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "missions" (
	"id" serial PRIMARY KEY,
	"workspace_id" text DEFAULT 'default' NOT NULL,
	"character_id" integer,
	"title" text DEFAULT '' NOT NULL,
	"objective" text DEFAULT '' NOT NULL,
	"channel" text DEFAULT 'chat' NOT NULL,
	"autonomy" text DEFAULT 'supervised' NOT NULL,
	"clearance" text DEFAULT 'internal' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"steps" jsonb DEFAULT '[]' NOT NULL,
	"context_refs" jsonb DEFAULT '[]' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"result" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "missions" ADD CONSTRAINT "missions_character_id_characters_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id");