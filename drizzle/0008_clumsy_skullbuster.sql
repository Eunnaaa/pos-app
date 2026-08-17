CREATE TABLE "staff_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"table_id" uuid NOT NULL,
	"reason" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"served_at" timestamp with time zone,
	"served_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "staff_calls" ADD CONSTRAINT "staff_calls_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_calls" ADD CONSTRAINT "staff_calls_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_calls" ADD CONSTRAINT "staff_calls_table_id_dining_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."dining_tables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "staff_calls_org_branch_status_idx" ON "staff_calls" USING btree ("organization_id","branch_id","status");--> statement-breakpoint
CREATE INDEX "staff_calls_table_idx" ON "staff_calls" USING btree ("table_id");