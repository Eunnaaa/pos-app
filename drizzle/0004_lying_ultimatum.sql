DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "tenant_members" WHERE "role" NOT IN ('owner', 'cashier')) THEN
    RAISE EXCEPTION 'Legacy tenant member roles exist; audit and migrate them before applying owner/cashier role policy';
  END IF;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_members_active_owner_uidx" ON "tenant_members" USING btree ("organization_id") WHERE "tenant_members"."role" = 'owner' and "tenant_members"."is_active" = true;--> statement-breakpoint
ALTER TABLE "tenant_members" ADD CONSTRAINT "tenant_members_role_check" CHECK ("tenant_members"."role" in ('owner', 'cashier'));