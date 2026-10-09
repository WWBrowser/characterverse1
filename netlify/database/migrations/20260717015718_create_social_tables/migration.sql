CREATE TABLE "social_bulletins" (
	"id" serial PRIMARY KEY,
	"member_id" integer NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "social_comments" (
	"id" serial PRIMARY KEY,
	"profile_id" integer NOT NULL,
	"author_id" integer NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "social_friendships" (
	"id" serial PRIMARY KEY,
	"requester_id" integer NOT NULL,
	"addressee_id" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "social_members" (
	"id" serial PRIMARY KEY,
	"handle" text NOT NULL UNIQUE,
	"email" text NOT NULL UNIQUE,
	"password_hash" text NOT NULL,
	"display_name" text DEFAULT '' NOT NULL,
	"accent" text DEFAULT '#3b5998' NOT NULL,
	"mood" text DEFAULT 'online' NOT NULL,
	"status" text DEFAULT '' NOT NULL,
	"headline" text DEFAULT '' NOT NULL,
	"region" text DEFAULT '' NOT NULL,
	"pronouns" text DEFAULT '' NOT NULL,
	"values" text DEFAULT '' NOT NULL,
	"interests" text DEFAULT '' NOT NULL,
	"bio" text DEFAULT '' NOT NULL,
	"seeded" boolean DEFAULT false NOT NULL,
	"profile_views" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "social_sessions" (
	"token" text PRIMARY KEY,
	"member_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "social_bulletins" ADD CONSTRAINT "social_bulletins_member_id_social_members_id_fkey" FOREIGN KEY ("member_id") REFERENCES "social_members"("id");--> statement-breakpoint
ALTER TABLE "social_comments" ADD CONSTRAINT "social_comments_profile_id_social_members_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "social_members"("id");--> statement-breakpoint
ALTER TABLE "social_comments" ADD CONSTRAINT "social_comments_author_id_social_members_id_fkey" FOREIGN KEY ("author_id") REFERENCES "social_members"("id");--> statement-breakpoint
ALTER TABLE "social_friendships" ADD CONSTRAINT "social_friendships_requester_id_social_members_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "social_members"("id");--> statement-breakpoint
ALTER TABLE "social_friendships" ADD CONSTRAINT "social_friendships_addressee_id_social_members_id_fkey" FOREIGN KEY ("addressee_id") REFERENCES "social_members"("id");--> statement-breakpoint
ALTER TABLE "social_sessions" ADD CONSTRAINT "social_sessions_member_id_social_members_id_fkey" FOREIGN KEY ("member_id") REFERENCES "social_members"("id");