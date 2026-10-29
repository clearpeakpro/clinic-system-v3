-- T-008. Generada por drizzle-kit, salvo la restricción UNIQUE (chain, seq) de
-- audit_log, que va en 0014 después de encadenar las filas existentes.
CREATE TABLE "app"."audit_chain_heads" (
	"chain" text PRIMARY KEY NOT NULL,
	"seq" bigint NOT NULL,
	"hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."idempotency_keys" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"key" text NOT NULL,
	"request_hash" text NOT NULL,
	"response_status" integer NOT NULL,
	"resource_ids" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "idempotency_keys_organization_id_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "idempotency_keys_organization_id_key_key" UNIQUE("organization_id","key")
);
--> statement-breakpoint
CREATE TABLE "app"."outbox" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"entity_type" text,
	"entity_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"payload" text,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	CONSTRAINT "outbox_organization_id_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "outbox_status_check" CHECK ("app"."outbox"."status" in ('pending', 'sent', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "app"."audit_log" DROP CONSTRAINT "audit_log_actor_type_check";--> statement-breakpoint
ALTER TABLE "app"."audit_log" ADD COLUMN "chain" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."audit_log" ADD COLUMN "seq" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."audit_log" ADD COLUMN "prev_hash" text;--> statement-breakpoint
ALTER TABLE "app"."audit_log" ADD COLUMN "hash" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."idempotency_keys" ADD CONSTRAINT "idempotency_keys_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "app"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."outbox" ADD CONSTRAINT "outbox_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "app"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."audit_log" ADD CONSTRAINT "audit_log_actor_type_check" CHECK ("app"."audit_log"."actor_type" in ('user', 'kiosk', 'anonymous', 'operator', 'system'));