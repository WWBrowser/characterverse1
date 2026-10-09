CREATE TABLE "studio_members" (
	"id" serial PRIMARY KEY,
	"workspace_id" text DEFAULT 'default' NOT NULL,
	"session_id" text DEFAULT '' NOT NULL,
	"handle" text DEFAULT '' NOT NULL,
	"role" text DEFAULT 'moderator' NOT NULL,
	"is_self" boolean DEFAULT false NOT NULL,
	"avatar" text DEFAULT '🛡️' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "studio_modules" (
	"id" serial PRIMARY KEY,
	"workspace_id" text DEFAULT 'default' NOT NULL,
	"module_key" text DEFAULT '' NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"icon" text DEFAULT '📦' NOT NULL,
	"group_name" text DEFAULT 'Platform' NOT NULL,
	"path" text DEFAULT '' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"min_rank" integer DEFAULT 10 NOT NULL,
	"settings" jsonb DEFAULT '{}' NOT NULL,
	"llm" jsonb DEFAULT '{}' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
