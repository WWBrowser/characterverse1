CREATE TABLE "cvj_gigs" (
	"id" serial PRIMARY KEY,
	"title" text DEFAULT '' NOT NULL,
	"category" text DEFAULT 'Writing' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"seller_name" text DEFAULT '' NOT NULL,
	"seller_avatar" text DEFAULT '🧑‍💻' NOT NULL,
	"seller_tagline" text DEFAULT '' NOT NULL,
	"accent" text DEFAULT '#1dbf73' NOT NULL,
	"agent_character_id" integer,
	"instructions" text DEFAULT '' NOT NULL,
	"price_coins" integer DEFAULT 25 NOT NULL,
	"coin" text DEFAULT 'silver' NOT NULL,
	"delivery_label" text DEFAULT '1 min' NOT NULL,
	"tags" jsonb DEFAULT '[]' NOT NULL,
	"rating_total" integer DEFAULT 0 NOT NULL,
	"rating_count" integer DEFAULT 0 NOT NULL,
	"orders" integer DEFAULT 0 NOT NULL,
	"earned_coins" integer DEFAULT 0 NOT NULL,
	"creator_session" text DEFAULT '' NOT NULL,
	"seeded" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cvj_orders" (
	"id" serial PRIMARY KEY,
	"gig_id" integer NOT NULL,
	"buyer_session" text DEFAULT '' NOT NULL,
	"brief" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'delivered' NOT NULL,
	"deliverable" text DEFAULT '' NOT NULL,
	"price_coins" integer DEFAULT 0 NOT NULL,
	"coin" text DEFAULT 'silver' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"delivered_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "cvj_reviews" (
	"id" serial PRIMARY KEY,
	"gig_id" integer NOT NULL,
	"order_id" integer,
	"buyer_session" text DEFAULT '' NOT NULL,
	"author_name" text DEFAULT 'buyer' NOT NULL,
	"rating" integer DEFAULT 5 NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "cvj_orders" ADD CONSTRAINT "cvj_orders_gig_id_cvj_gigs_id_fkey" FOREIGN KEY ("gig_id") REFERENCES "cvj_gigs"("id");--> statement-breakpoint
ALTER TABLE "cvj_reviews" ADD CONSTRAINT "cvj_reviews_gig_id_cvj_gigs_id_fkey" FOREIGN KEY ("gig_id") REFERENCES "cvj_gigs"("id");