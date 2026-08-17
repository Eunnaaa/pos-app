CREATE TABLE "qr_order_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"table_id" uuid NOT NULL,
	"token" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN "table_id" uuid;--> statement-breakpoint
ALTER TABLE "qr_order_tokens" ADD CONSTRAINT "qr_order_tokens_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_order_tokens" ADD CONSTRAINT "qr_order_tokens_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_order_tokens" ADD CONSTRAINT "qr_order_tokens_table_id_dining_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."dining_tables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "qr_order_tokens_token_uidx" ON "qr_order_tokens" USING btree ("token");--> statement-breakpoint
CREATE INDEX "qr_order_tokens_org_branch_idx" ON "qr_order_tokens" USING btree ("organization_id","branch_id");--> statement-breakpoint
CREATE INDEX "qr_order_tokens_table_idx" ON "qr_order_tokens" USING btree ("table_id");--> statement-breakpoint
CREATE INDEX "qr_order_tokens_active_idx" ON "qr_order_tokens" USING btree ("is_active");--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_table_id_dining_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."dining_tables"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sales_orders_table_idx" ON "sales_orders" USING btree ("organization_id","table_id");