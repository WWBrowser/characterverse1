CREATE TABLE "route_agents" (
	"id" serial PRIMARY KEY,
	"workspace_id" text DEFAULT 'default' NOT NULL,
	"name" text NOT NULL,
	"role" text DEFAULT 'agent' NOT NULL,
	"capability" text DEFAULT 'research' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"route_condition" text DEFAULT '' NOT NULL,
	"skills" jsonb DEFAULT '[]' NOT NULL,
	"icon" text DEFAULT '🐾' NOT NULL,
	"color" text DEFAULT '#7c5cbf' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"clearance" text DEFAULT 'internal' NOT NULL,
	"requires_signoff" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
