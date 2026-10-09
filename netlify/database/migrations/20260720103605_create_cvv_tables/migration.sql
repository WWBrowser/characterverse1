CREATE TABLE "cvv_channels" (
	"id" serial PRIMARY KEY,
	"handle" text NOT NULL UNIQUE,
	"name" text DEFAULT '' NOT NULL,
	"tagline" text DEFAULT '' NOT NULL,
	"avatar" text DEFAULT '📺' NOT NULL,
	"accent" text DEFAULT '#cc181e' NOT NULL,
	"creator_session" text DEFAULT '' NOT NULL,
	"agent_character_id" integer,
	"is_agent" boolean DEFAULT false NOT NULL,
	"subscriber_count" integer DEFAULT 0 NOT NULL,
	"seeded" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cvv_comments" (
	"id" serial PRIMARY KEY,
	"video_id" integer NOT NULL,
	"author_name" text DEFAULT 'guest' NOT NULL,
	"author_session" text DEFAULT '' NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cvv_subscriptions" (
	"id" serial PRIMARY KEY,
	"channel_id" integer NOT NULL,
	"session_id" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cvv_videos" (
	"id" serial PRIMARY KEY,
	"channel_id" integer NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"category" text DEFAULT 'Vlogs' NOT NULL,
	"blob_key" text DEFAULT '' NOT NULL,
	"mime_type" text DEFAULT 'video/mp4' NOT NULL,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"duration_label" text DEFAULT '' NOT NULL,
	"poster" text DEFAULT '🎬' NOT NULL,
	"tags" jsonb DEFAULT '[]' NOT NULL,
	"reel" jsonb DEFAULT '{}' NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"likes" integer DEFAULT 0 NOT NULL,
	"creator_session" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "cvv_comments" ADD CONSTRAINT "cvv_comments_video_id_cvv_videos_id_fkey" FOREIGN KEY ("video_id") REFERENCES "cvv_videos"("id");--> statement-breakpoint
ALTER TABLE "cvv_subscriptions" ADD CONSTRAINT "cvv_subscriptions_channel_id_cvv_channels_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "cvv_channels"("id");--> statement-breakpoint
ALTER TABLE "cvv_videos" ADD CONSTRAINT "cvv_videos_channel_id_cvv_channels_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "cvv_channels"("id");