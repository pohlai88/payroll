-- RBAC: users, customizable roles, and the resource × CRUD permission matrix.
--
-- SYSTEM_ADMIN is seeded separately; its access is implicit and total. A
-- BEFORE INSERT trigger rejects any role_permissions row targeting an
-- is_system role so that matrix cannot drift from "everything".

CREATE TYPE "public"."permission_action" AS ENUM('CREATE', 'READ', 'UPDATE', 'DELETE');--> statement-breakpoint
CREATE TYPE "public"."permission_resource" AS ENUM('COMPANY', 'EMPLOYMENT', 'PAY_RUN', 'PAY_ITEM', 'RULE_PACK', 'REPORT');--> statement-breakpoint
CREATE TYPE "public"."role_scope" AS ENUM('GLOBAL', 'COMPANY');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('ACTIVE', 'DISABLED');--> statement-breakpoint

CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"status" "user_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_not_blank" CHECK (length(btrim("users"."email")) > 0),
	CONSTRAINT "users_name_not_blank" CHECK (length(btrim("users"."name")) > 0)
);--> statement-breakpoint

CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"scope" "role_scope" DEFAULT 'COMPANY' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_code_unique" UNIQUE("code"),
	CONSTRAINT "roles_code_not_blank" CHECK (length(btrim("roles"."code")) > 0),
	CONSTRAINT "roles_name_not_blank" CHECK (length(btrim("roles"."name")) > 0),
	CONSTRAINT "roles_system_is_global" CHECK ("roles"."is_system" = false OR "roles"."scope" = 'GLOBAL')
);--> statement-breakpoint

CREATE TABLE "role_permissions" (
	"role_id" uuid NOT NULL,
	"resource" "permission_resource" NOT NULL,
	"action" "permission_action" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_permissions_role_id_resource_action_pk" PRIMARY KEY("role_id","resource","action")
);--> statement-breakpoint

CREATE TABLE "user_role_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"company_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_role_assignments" ADD CONSTRAINT "user_role_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_role_assignments" ADD CONSTRAINT "user_role_assignments_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_role_assignments" ADD CONSTRAINT "user_role_assignments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "role_permissions_role" ON "role_permissions" USING btree ("role_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_role_assignments_global_unique" ON "user_role_assignments" USING btree ("user_id","role_id") WHERE "user_role_assignments"."company_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "user_role_assignments_company_unique" ON "user_role_assignments" USING btree ("user_id","role_id","company_id") WHERE "user_role_assignments"."company_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "user_role_assignments_user" ON "user_role_assignments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_role_assignments_role" ON "user_role_assignments" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "user_role_assignments_company" ON "user_role_assignments" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");--> statement-breakpoint

-- System roles never store matrix rows: their access is implicit and total.
CREATE FUNCTION reject_system_role_permissions() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  target_is_system boolean;
BEGIN
  SELECT roles.is_system INTO target_is_system
    FROM roles WHERE roles.id = NEW.role_id;

  IF target_is_system IS TRUE THEN
    RAISE EXCEPTION
      'role % is a system role: permission matrix rows are not stored for it',
      NEW.role_id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER role_permissions_reject_system_role
  BEFORE INSERT OR UPDATE ON role_permissions
  FOR EACH ROW EXECUTE FUNCTION reject_system_role_permissions();
