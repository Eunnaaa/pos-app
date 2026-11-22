ALTER TABLE "refunds" ADD COLUMN "cash_session_id" uuid;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_cash_session_id_cash_register_sessions_id_fk" FOREIGN KEY ("cash_session_id") REFERENCES "public"."cash_register_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
UPDATE "refunds" AS r
SET "cash_session_id" = so."cash_session_id"
FROM "sales_returns" AS sr
JOIN "sales_orders" AS so ON so."id" = sr."order_id"
WHERE r."return_id" = sr."id"
  AND r."organization_id" = so."organization_id"
  AND r."status" = 'processed'
  AND so."cash_session_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "refunds_cash_session_idx" ON "refunds" USING btree ("cash_session_id");
