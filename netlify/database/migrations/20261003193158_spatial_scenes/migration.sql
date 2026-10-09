CREATE TABLE "spatial_scenes" (
	"id" serial PRIMARY KEY,
	"slug" text NOT NULL UNIQUE,
	"title" text DEFAULT '' NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"sdom_version" text DEFAULT '1.0' NOT NULL,
	"doc" jsonb NOT NULL,
	"node_count" integer DEFAULT 0 NOT NULL,
	"source" text DEFAULT 'published' NOT NULL,
	"creator_session" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
