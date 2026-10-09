CREATE TABLE "user_memories" (
	"id" serial PRIMARY KEY,
	"session_id" text DEFAULT '' NOT NULL,
	"kind" text DEFAULT 'preference' NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"character_id" integer,
	"confidence" integer DEFAULT 3 NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
