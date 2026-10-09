CREATE TABLE "cmail_adoptions" (
	"id" serial PRIMARY KEY,
	"session_id" text NOT NULL,
	"character_id" integer NOT NULL,
	"via" text DEFAULT 'cmail' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cmail_messages" (
	"id" serial PRIMARY KEY,
	"thread_id" integer NOT NULL,
	"author" text DEFAULT 'me' NOT NULL,
	"status" text DEFAULT 'sent' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"voice_id" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cmail_threads" (
	"id" serial PRIMARY KEY,
	"session_id" text NOT NULL,
	"character_id" integer NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"starred" boolean DEFAULT false NOT NULL,
	"important" boolean DEFAULT false NOT NULL,
	"unread" boolean DEFAULT false NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"trashed" boolean DEFAULT false NOT NULL,
	"snoozed_until" timestamp,
	"last_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX "cmail_adoptions_session_character" ON "cmail_adoptions" ("session_id","character_id");--> statement-breakpoint
ALTER TABLE "cmail_adoptions" ADD CONSTRAINT "cmail_adoptions_character_id_characters_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id");--> statement-breakpoint
ALTER TABLE "cmail_messages" ADD CONSTRAINT "cmail_messages_thread_id_cmail_threads_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "cmail_threads"("id");--> statement-breakpoint
ALTER TABLE "cmail_messages" ADD CONSTRAINT "cmail_messages_voice_id_characters_id_fkey" FOREIGN KEY ("voice_id") REFERENCES "characters"("id");--> statement-breakpoint
ALTER TABLE "cmail_threads" ADD CONSTRAINT "cmail_threads_character_id_characters_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id");