import {
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { idColumn, moneyColumn, timestamps } from "./helpers";
import { salesOrders } from "./sales";
import { branches, organizations } from "./tenancy";

export const employees = pgTable(
  "employees",
  {
    id: idColumn(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    employeeNumber: text("employee_number").notNull(),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    jobTitle: text("job_title"),
    employmentStatus: text("employment_status").$type<"active" | "inactive" | "terminated">().default("active").notNull(),
    hiredAt: date("hired_at"),
    salaryReferenceAmount: moneyColumn("salary_reference_amount"),
    commissionRateBps: integer("commission_rate_bps").default(0).notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("employees_org_number_uidx").on(table.organizationId, table.employeeNumber),
    uniqueIndex("employees_org_user_uidx").on(table.organizationId, table.userId),
  ],
);

export const employeeBranches = pgTable(
  "employee_branches",
  {
    id: idColumn(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id").notNull().references(() => branches.id, { onDelete: "cascade" }),
    ...timestamps(),
  },
  (table) => [uniqueIndex("employee_branches_employee_branch_uidx").on(table.employeeId, table.branchId)],
);

export const employeeShifts = pgTable(
  "employee_shifts",
  {
    id: idColumn(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id").notNull().references(() => branches.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    status: text("status").$type<"scheduled" | "active" | "completed" | "cancelled">().default("scheduled").notNull(),
    notes: text("notes"),
    ...timestamps(),
  },
  (table) => [index("employee_shifts_branch_time_idx").on(table.branchId, table.startsAt)],
);

export const attendance = pgTable(
  "attendance",
  {
    id: idColumn(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
    shiftId: uuid("shift_id").references(() => employeeShifts.id, { onDelete: "set null" }),
    clockedInAt: timestamp("clocked_in_at", { withTimezone: true }).notNull(),
    clockedOutAt: timestamp("clocked_out_at", { withTimezone: true }),
    clockInIp: text("clock_in_ip"),
    clockOutIp: text("clock_out_ip"),
    notes: text("notes"),
    ...timestamps(),
  },
  (table) => [index("attendance_employee_time_idx").on(table.employeeId, table.clockedInAt)],
);

export const employeeCommissions = pgTable(
  "employee_commissions",
  {
    id: idColumn(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
    orderId: uuid("order_id").references(() => salesOrders.id, { onDelete: "set null" }),
    amount: moneyColumn("amount"),
    status: text("status").$type<"pending" | "approved" | "paid" | "void">().default("pending").notNull(),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [index("employee_commissions_employee_period_idx").on(table.employeeId, table.periodStart)],
);
