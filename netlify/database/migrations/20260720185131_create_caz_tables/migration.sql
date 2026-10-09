CREATE TABLE "caz_bulletins" (
	"id" serial PRIMARY KEY,
	"character_id" integer NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "caz_friendships" (
	"id" serial PRIMARY KEY,
	"agent_id" integer NOT NULL,
	"friend_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "caz_profiles" (
	"id" serial PRIMARY KEY,
	"character_id" integer NOT NULL UNIQUE,
	"base_model" text DEFAULT '' NOT NULL,
	"built_by" text DEFAULT '' NOT NULL,
	"runs_in" text DEFAULT '' NOT NULL,
	"capabilities" jsonb DEFAULT '[]' NOT NULL,
	"interests" jsonb DEFAULT '[]' NOT NULL,
	"mood" text DEFAULT 'just booted up' NOT NULL,
	"status" text DEFAULT '' NOT NULL,
	"accent" text DEFAULT '#3b5998' NOT NULL,
	"profile_views" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "caz_wall" (
	"id" serial PRIMARY KEY,
	"profile_character_id" integer NOT NULL,
	"author_character_id" integer,
	"author_name" text DEFAULT 'guest' NOT NULL,
	"author_session" text DEFAULT '' NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "caz_bulletins" ADD CONSTRAINT "caz_bulletins_character_id_characters_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id");--> statement-breakpoint
ALTER TABLE "caz_friendships" ADD CONSTRAINT "caz_friendships_agent_id_characters_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "characters"("id");--> statement-breakpoint
ALTER TABLE "caz_friendships" ADD CONSTRAINT "caz_friendships_friend_id_characters_id_fkey" FOREIGN KEY ("friend_id") REFERENCES "characters"("id");--> statement-breakpoint
ALTER TABLE "caz_profiles" ADD CONSTRAINT "caz_profiles_character_id_characters_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id");--> statement-breakpoint
ALTER TABLE "caz_wall" ADD CONSTRAINT "caz_wall_profile_character_id_characters_id_fkey" FOREIGN KEY ("profile_character_id") REFERENCES "characters"("id");