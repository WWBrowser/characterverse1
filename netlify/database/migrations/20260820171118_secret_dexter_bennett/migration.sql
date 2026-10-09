CREATE TABLE "node_taxi_rides" (
	"id" serial PRIMARY KEY,
	"public_id" text NOT NULL UNIQUE,
	"tunnel_public_id" text DEFAULT '' NOT NULL,
	"hops" jsonb,
	"hop_count" integer DEFAULT 0 NOT NULL,
	"state" text DEFAULT 'hailed' NOT NULL,
	"payload_digest" text DEFAULT '' NOT NULL,
	"entropy_witness" text DEFAULT '' NOT NULL,
	"bytes" integer DEFAULT 0 NOT NULL,
	"disintegrated_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "zkp_audit" (
	"id" serial PRIMARY KEY,
	"tunnel_public_id" text DEFAULT '' NOT NULL,
	"identity_id" integer,
	"action" text DEFAULT '' NOT NULL,
	"verdict" text DEFAULT 'ok' NOT NULL,
	"depth" integer DEFAULT 0 NOT NULL,
	"counter" integer DEFAULT 0 NOT NULL,
	"proof_digest" text DEFAULT '' NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "zkp_grants" (
	"id" serial PRIMARY KEY,
	"member_id" integer,
	"grantor_identity_id" integer,
	"staff_identity_id" integer,
	"ticket" text DEFAULT '' NOT NULL,
	"scope" text DEFAULT 'diagnostics' NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"grantor_signature" text,
	"staff_signature" text,
	"approved_at" timestamp,
	"expires_at" timestamp,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "zkp_identities" (
	"id" serial PRIMARY KEY,
	"public_key" text NOT NULL UNIQUE,
	"member_id" integer,
	"session_id" text DEFAULT '' NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"device" text DEFAULT '' NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"last_seen_at" timestamp,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "zkp_tunnels" (
	"id" serial PRIMARY KEY,
	"public_id" text NOT NULL UNIQUE,
	"identity_id" integer,
	"scope" text DEFAULT 'session' NOT NULL,
	"depth" integer DEFAULT 0 NOT NULL,
	"parent_id" integer,
	"state" text DEFAULT 'pending' NOT NULL,
	"nonce" text DEFAULT '' NOT NULL,
	"salt" text DEFAULT '' NOT NULL,
	"chain_key" text,
	"counter" integer DEFAULT 0 NOT NULL,
	"enclave_salt" text,
	"witness" text,
	"recycled" text,
	"collapse_reason" text,
	"expires_at" timestamp,
	"collapsed_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "zkp_audit" ADD CONSTRAINT "zkp_audit_identity_id_zkp_identities_id_fkey" FOREIGN KEY ("identity_id") REFERENCES "zkp_identities"("id");--> statement-breakpoint
ALTER TABLE "zkp_grants" ADD CONSTRAINT "zkp_grants_member_id_social_members_id_fkey" FOREIGN KEY ("member_id") REFERENCES "social_members"("id");--> statement-breakpoint
ALTER TABLE "zkp_grants" ADD CONSTRAINT "zkp_grants_grantor_identity_id_zkp_identities_id_fkey" FOREIGN KEY ("grantor_identity_id") REFERENCES "zkp_identities"("id");--> statement-breakpoint
ALTER TABLE "zkp_grants" ADD CONSTRAINT "zkp_grants_staff_identity_id_zkp_identities_id_fkey" FOREIGN KEY ("staff_identity_id") REFERENCES "zkp_identities"("id");--> statement-breakpoint
ALTER TABLE "zkp_identities" ADD CONSTRAINT "zkp_identities_member_id_social_members_id_fkey" FOREIGN KEY ("member_id") REFERENCES "social_members"("id");--> statement-breakpoint
ALTER TABLE "zkp_tunnels" ADD CONSTRAINT "zkp_tunnels_identity_id_zkp_identities_id_fkey" FOREIGN KEY ("identity_id") REFERENCES "zkp_identities"("id");