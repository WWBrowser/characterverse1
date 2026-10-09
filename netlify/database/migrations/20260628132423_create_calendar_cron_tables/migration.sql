CREATE TABLE "calendar_events" (
	"id" serial PRIMARY KEY,
	"workspace_id" text DEFAULT 'default' NOT NULL,
	"session_id" text DEFAULT '' NOT NULL,
	"calendar" text DEFAULT 'datetime' NOT NULL,
	"kind" text DEFAULT 'appointment' NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'upcoming' NOT NULL,
	"scheduled_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cron_pulses" (
	"id" serial PRIMARY KEY,
	"workspace_id" text DEFAULT 'default' NOT NULL,
	"source" text DEFAULT 'cron' NOT NULL,
	"sample" jsonb DEFAULT '{}' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"fired_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cron_subscriptions" (
	"id" serial PRIMARY KEY,
	"workspace_id" text DEFAULT 'default' NOT NULL,
	"session_id" text NOT NULL UNIQUE,
	"email" text DEFAULT '' NOT NULL,
	"agents_path" text DEFAULT '/memory' NOT NULL,
	"cadence" text DEFAULT 'daily' NOT NULL,
	"scope" text DEFAULT 'worked' NOT NULL,
	"dedicated_agent_id" integer,
	"last_fired_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
