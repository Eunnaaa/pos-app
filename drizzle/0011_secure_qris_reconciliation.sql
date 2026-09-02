CREATE TABLE "payment_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"name" text NOT NULL,
	"device_key" text NOT NULL,
	"merchant_account_id" text NOT NULL,
	"encrypted_secret" text NOT NULL,
	"allowed_packages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"sales_payment_id" uuid NOT NULL,
	"provider" text DEFAULT 'qris_direct' NOT NULL,
	"amount" bigint DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'IDR' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"settled_at" timestamp with time zone,
	"external_reference" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_attempts_positive_amount" CHECK ("payment_attempts"."amount" > 0),
	CONSTRAINT "payment_attempts_currency_check" CHECK ("payment_attempts"."currency" = 'IDR')
);
--> statement-breakpoint
CREATE TABLE "payment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"attempt_id" uuid,
	"event_id" text NOT NULL,
	"reference" text,
	"amount" bigint DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'IDR' NOT NULL,
	"source_package" text NOT NULL,
	"sender_name" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'received' NOT NULL,
	"raw_hash" text NOT NULL,
	"candidate_count" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_events_positive_amount" CHECK ("payment_events"."amount" > 0),
	CONSTRAINT "payment_events_currency_check" CHECK ("payment_events"."currency" = 'IDR'),
	CONSTRAINT "payment_events_candidate_count_check" CHECK ("payment_events"."candidate_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "payment_devices" ADD CONSTRAINT "payment_devices_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payment_devices" ADD CONSTRAINT "payment_devices_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_device_id_payment_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."payment_devices"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_order_id_sales_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."sales_orders"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_sales_payment_id_sales_payments_id_fk" FOREIGN KEY ("sales_payment_id") REFERENCES "public"."sales_payments"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_device_id_payment_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."payment_devices"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_attempt_id_payment_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."payment_attempts"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "payment_devices_key_uidx" ON "payment_devices" USING btree ("device_key");
CREATE UNIQUE INDEX "payment_devices_org_merchant_uidx" ON "payment_devices" USING btree ("organization_id","merchant_account_id");
CREATE INDEX "payment_devices_org_branch_idx" ON "payment_devices" USING btree ("organization_id","branch_id");
CREATE UNIQUE INDEX "payment_attempts_order_uidx" ON "payment_attempts" USING btree ("order_id");
CREATE UNIQUE INDEX "payment_attempts_sales_payment_uidx" ON "payment_attempts" USING btree ("sales_payment_id");
CREATE INDEX "payment_attempts_match_idx" ON "payment_attempts" USING btree ("device_id","status","amount","expires_at");
CREATE INDEX "payment_attempts_org_branch_idx" ON "payment_attempts" USING btree ("organization_id","branch_id");
CREATE UNIQUE INDEX "payment_events_device_event_uidx" ON "payment_events" USING btree ("device_id","event_id");
CREATE UNIQUE INDEX "payment_events_device_reference_uidx" ON "payment_events" USING btree ("device_id","reference") WHERE "payment_events"."reference" is not null;
CREATE INDEX "payment_events_org_branch_time_idx" ON "payment_events" USING btree ("organization_id","branch_id","occurred_at");
CREATE INDEX "payment_events_status_idx" ON "payment_events" USING btree ("status","created_at");
