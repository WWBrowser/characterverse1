CREATE TABLE "desk_anchors" (
	"id" serial PRIMARY KEY,
	"conversation_id" integer NOT NULL,
	"character_id" integer NOT NULL,
	"session_id" text DEFAULT '' NOT NULL,
	"kind" text DEFAULT 'message' NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"message_id" integer,
	"source_ref" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "desk_purges" (
	"id" serial PRIMARY KEY,
	"conversation_id" integer NOT NULL,
	"character_id" integer NOT NULL,
	"session_id" text DEFAULT '' NOT NULL,
	"node" text DEFAULT 'stella' NOT NULL,
	"cleared_through_message_id" integer,
	"messages_filed" integer DEFAULT 0 NOT NULL,
	"tokens_reclaimed" integer DEFAULT 0 NOT NULL,
	"noise_before" integer DEFAULT 0 NOT NULL,
	"bandwidth_after" integer DEFAULT 0 NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "desk_anchors" ADD CONSTRAINT "desk_anchors_conversation_id_conversations_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id");--> statement-breakpoint
ALTER TABLE "desk_anchors" ADD CONSTRAINT "desk_anchors_character_id_characters_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id");--> statement-breakpoint
ALTER TABLE "desk_purges" ADD CONSTRAINT "desk_purges_conversation_id_conversations_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id");--> statement-breakpoint
ALTER TABLE "desk_purges" ADD CONSTRAINT "desk_purges_character_id_characters_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id");