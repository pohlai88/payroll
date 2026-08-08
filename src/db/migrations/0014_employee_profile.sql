CREATE TYPE "public"."employee_custom_field_data_type" AS ENUM('TEXT', 'NUMBER', 'DATE', 'BOOLEAN');--> statement-breakpoint
CREATE TABLE "employee_custom_field_defs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"field_key" text NOT NULL,
	"label" text NOT NULL,
	"data_type" "employee_custom_field_data_type" NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employee_custom_field_defs_field_key_unique" UNIQUE("field_key"),
	CONSTRAINT "employee_custom_field_defs_field_key_not_blank" CHECK (length(btrim("employee_custom_field_defs"."field_key")) > 0),
	CONSTRAINT "employee_custom_field_defs_label_not_blank" CHECK (length(btrim("employee_custom_field_defs"."label")) > 0)
);
--> statement-breakpoint
CREATE TABLE "employment_profiles" (
	"employment_id" uuid PRIMARY KEY NOT NULL,
	"job_title" text,
	"department" text,
	"superior_name" text,
	"gender" text,
	"race" text,
	"religion" text,
	"marital_status" text,
	"email" text,
	"mobile_no" text,
	"phone_no" text,
	"address_line" text,
	"city" text,
	"state" text,
	"postal_code" text,
	"country" text,
	"payment_method" text,
	"final_company_code" text,
	"master_primary_company_code" text,
	"payroll_notes" text,
	"import_source_notes" text,
	"extra_attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "employment_profiles" ADD CONSTRAINT "employment_profiles_employment_id_employments_id_fk" FOREIGN KEY ("employment_id") REFERENCES "public"."employments"("id") ON DELETE cascade ON UPDATE no action;