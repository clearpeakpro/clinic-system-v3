-- T-006a: invitaciones con varios roles y sedes (S-ADM-03), revocación y
-- marca de restablecimiento del MFA (S-ADM-08).
CREATE TABLE "app"."invitation_roles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"invitation_id" uuid NOT NULL,
	"location_id" uuid,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitation_roles_organization_id_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "invitation_roles_assignment_key" UNIQUE NULLS NOT DISTINCT("invitation_id","location_id","role"),
	CONSTRAINT "invitation_roles_role_check" CHECK (role in ('propietario', 'administrador', 'recepcion', 'enfermeria', 'proveedor')),
	CONSTRAINT "invitation_roles_org_wide_check" CHECK ("app"."invitation_roles"."location_id" is not null or "app"."invitation_roles"."role" in ('propietario', 'administrador'))
);
--> statement-breakpoint
ALTER TABLE "app"."invitations" DROP CONSTRAINT "invitations_role_check";--> statement-breakpoint
ALTER TABLE "app"."invitations" DROP CONSTRAINT "invitations_org_wide_check";--> statement-breakpoint
ALTER TABLE "app"."invitations" DROP CONSTRAINT "invitations_location_fk";
--> statement-breakpoint
ALTER TABLE "app"."invitations" ALTER COLUMN "role" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "auth"."user" ADD COLUMN "mfa_reset_at" timestamp with time zone;--> statement-breakpoint
-- Invitaciones anteriores (solo en bases de desarrollo): nombre vacío. Sus
-- roles no se copian (la migración no puede leerlas sin el contexto de cada
-- organización); una invitación sin roles se rechaza al aceptarla.
ALTER TABLE "app"."invitations" ADD COLUMN "name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."invitations" ALTER COLUMN "name" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "app"."invitations" ADD COLUMN "revoked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "app"."invitation_roles" ADD CONSTRAINT "invitation_roles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "app"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."invitation_roles" ADD CONSTRAINT "invitation_roles_invitation_fk" FOREIGN KEY ("organization_id","invitation_id") REFERENCES "app"."invitations"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."invitation_roles" ADD CONSTRAINT "invitation_roles_location_fk" FOREIGN KEY ("organization_id","location_id") REFERENCES "app"."locations"("organization_id","id") ON DELETE no action ON UPDATE no action;