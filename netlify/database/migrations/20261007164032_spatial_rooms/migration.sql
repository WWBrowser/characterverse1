CREATE TABLE "room_events" (
	"id" serial PRIMARY KEY,
	"room_id" text NOT NULL,
	"run_id" text DEFAULT '' NOT NULL,
	"source" text DEFAULT 'chat' NOT NULL,
	"actor" text DEFAULT '' NOT NULL,
	"purpose" text NOT NULL,
	"station" text DEFAULT '' NOT NULL,
	"phase" text DEFAULT 'start' NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "spatial_rooms" (
	"id" text PRIMARY KEY,
	"title" text DEFAULT '' NOT NULL,
	"owner" text DEFAULT '' NOT NULL,
	"doc" jsonb NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "room_events_room_id" ON "room_events" ("room_id","id");