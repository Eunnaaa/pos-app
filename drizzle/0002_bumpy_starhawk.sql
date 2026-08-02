CREATE TABLE "book_closing_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"period_type" text NOT NULL,
	"period_key" text NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"timezone" text NOT NULL,
	"status" text DEFAULT 'closed' NOT NULL,
	"totals" jsonb NOT NULL,
	"closed_by" text,
	"closed_at" timestamp with time zone,
	"reopened_by" text,
	"reopened_at" timestamp with time zone,
	"reopen_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "book_closing_periods_valid_range" CHECK ("book_closing_periods"."period_end" > "book_closing_periods"."period_start")
);
--> statement-breakpoint
CREATE TABLE "cash_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"direction" text NOT NULL,
	"amount" bigint DEFAULT 0 NOT NULL,
	"category" text NOT NULL,
	"reason" text NOT NULL,
	"actor_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cash_movements_positive_amount" CHECK ("cash_movements"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "cash_register_sessions" ADD COLUMN "payment_breakdown" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "cash_register_sessions" ADD COLUMN "settlement_notes" text;--> statement-breakpoint
ALTER TABLE "cash_register_sessions" ADD COLUMN "settled_by" text;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN "cash_session_id" uuid;--> statement-breakpoint
ALTER TABLE "book_closing_periods" ADD CONSTRAINT "book_closing_periods_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_closing_periods" ADD CONSTRAINT "book_closing_periods_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_closing_periods" ADD CONSTRAINT "book_closing_periods_closed_by_user_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_closing_periods" ADD CONSTRAINT "book_closing_periods_reopened_by_user_id_fk" FOREIGN KEY ("reopened_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_session_id_cash_register_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."cash_register_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "book_closing_periods_scope_uidx" ON "book_closing_periods" USING btree ("organization_id","branch_id","period_type","period_key");--> statement-breakpoint
CREATE INDEX "book_closing_periods_status_idx" ON "book_closing_periods" USING btree ("organization_id","branch_id","status");--> statement-breakpoint
CREATE INDEX "cash_movements_session_time_idx" ON "cash_movements" USING btree ("session_id","created_at");--> statement-breakpoint
ALTER TABLE "cash_register_sessions" ADD CONSTRAINT "cash_register_sessions_settled_by_user_id_fk" FOREIGN KEY ("settled_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_cash_session_id_cash_register_sessions_id_fk" FOREIGN KEY ("cash_session_id") REFERENCES "public"."cash_register_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cash_register_sessions_one_open_uidx" ON "cash_register_sessions" USING btree ("register_id") WHERE "cash_register_sessions"."status" = 'open';