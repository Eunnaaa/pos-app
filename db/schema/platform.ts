import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { idColumn, timestamps, type JsonValue } from "./helpers";
import { branches, organizations } from "./tenancy";

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: idColumn(),
    organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "set null" }),
    branchId: uuid("branch_id").references(() => branches.id, { onDelete: "set null" }),
    actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id"),
    requestId: text("request_id"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    before: jsonb("before").$type<Record<string, JsonValue>>(),
    after: jsonb("after").$type<Record<string, JsonValue>>(),
    metadata: jsonb("metadata").$type<Record<string, JsonValue>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("audit_logs_org_time_idx").on(table.organizationId, table.createdAt),
    index("audit_logs_resource_idx").on(table.resourceType, table.resourceId),
    index("audit_logs_request_idx").on(table.requestId),
  ],
);

export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    id: idColumn(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    scope: text("scope").notNull(),
    requestHash: text("request_hash").notNull(),
    status: text("status").$type<"processing" | "completed" | "failed">().default("processing").notNull(),
    responseStatus: integer("response_status"),
    responseBody: jsonb("response_body").$type<JsonValue>(),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("idempotency_keys_org_scope_key_uidx").on(table.organizationId, table.scope, table.key),
    index("idempotency_keys_expires_idx").on(table.expiresAt),
  ],
);

export const files = pgTable(
  "files",
  {
    id: idColumn(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    uploadedBy: text("uploaded_by").references(() => user.id, { onDelete: "set null" }),
    bucket: text("bucket").notNull(),
    objectKey: text("object_key").notNull(),
    originalName: text("original_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    checksum: text("checksum"),
    visibility: text("visibility").$type<"private" | "public">().default("private").notNull(),
    metadata: jsonb("metadata").$type<Record<string, JsonValue>>().default({}),
    ...timestamps(),
  },
  (table) => [uniqueIndex("files_bucket_key_uidx").on(table.bucket, table.objectKey)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: idColumn(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    channel: text("channel").$type<"in_app" | "email" | "whatsapp" | "telegram" | "push">().notNull(),
    template: text("template").notNull(),
    recipient: text("recipient").notNull(),
    subject: text("subject"),
    body: text("body").notNull(),
    status: text("status").$type<"queued" | "sent" | "delivered" | "failed" | "read">().default("queued").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    lastError: text("last_error"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).defaultNow().notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    readAt: timestamp("read_at", { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [index("notifications_status_schedule_idx").on(table.status, table.scheduledAt)],
);

export const integrations = pgTable(
  "integrations",
  {
    id: idColumn(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    name: text("name").notNull(),
    encryptedConfig: text("encrypted_config").notNull(),
    status: text("status").$type<"active" | "inactive" | "error">().default("inactive").notNull(),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [uniqueIndex("integrations_org_provider_name_uidx").on(table.organizationId, table.provider, table.name)],
);

export const webhookEndpoints = pgTable(
  "webhook_endpoints",
  {
    id: idColumn(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    secret: text("secret").notNull(),
    events: jsonb("events").$type<string[]>().default([]).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    failureCount: integer("failure_count").default(0).notNull(),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [uniqueIndex("webhook_endpoints_org_url_uidx").on(table.organizationId, table.url)],
);

export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: idColumn(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    endpointId: uuid("endpoint_id").notNull().references(() => webhookEndpoints.id, { onDelete: "cascade" }),
    eventId: uuid("event_id").notNull(),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").$type<JsonValue>().notNull(),
    status: text("status").$type<"pending" | "delivered" | "failed">().default("pending").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).defaultNow().notNull(),
    responseStatus: integer("response_status"),
    responseBody: text("response_body"),
    lastError: text("last_error"),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("webhook_deliveries_endpoint_event_uidx").on(table.endpointId, table.eventId),
    index("webhook_deliveries_retry_idx").on(table.status, table.nextAttemptAt),
  ],
);

export const organizationSettings = pgTable(
  "organization_settings",
  {
    id: idColumn(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    namespace: text("namespace").notNull(),
    value: jsonb("value").$type<JsonValue>().notNull(),
    isSecret: boolean("is_secret").default(false).notNull(),
    ...timestamps(),
  },
  (table) => [uniqueIndex("organization_settings_namespace_uidx").on(table.organizationId, table.namespace)],
);

export const dataJobs = pgTable(
  "data_jobs",
  {
    id: idColumn(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    requestedBy: text("requested_by").references(() => user.id, { onDelete: "set null" }),
    type: text("type").$type<"import" | "export" | "backup" | "restore" | "ocr">().notNull(),
    resource: text("resource").notNull(),
    status: text("status").$type<"queued" | "processing" | "completed" | "failed">().default("queued").notNull(),
    inputFileId: uuid("input_file_id").references(() => files.id, { onDelete: "set null" }),
    outputFileId: uuid("output_file_id").references(() => files.id, { onDelete: "set null" }),
    progress: integer("progress").default(0).notNull(),
    result: jsonb("result").$type<JsonValue>(),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [index("data_jobs_org_status_idx").on(table.organizationId, table.status)],
);

export const syncChanges = pgTable(
  "sync_changes",
  {
    id: idColumn(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id").references(() => branches.id, { onDelete: "cascade" }),
    clientId: text("client_id").notNull(),
    clientSequence: integer("client_sequence").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    operation: text("operation").$type<"create" | "update" | "delete">().notNull(),
    payload: jsonb("payload").$type<JsonValue>().notNull(),
    status: text("status").$type<"pending" | "applied" | "conflict" | "rejected">().default("pending").notNull(),
    conflict: jsonb("conflict").$type<JsonValue>(),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [uniqueIndex("sync_changes_client_sequence_uidx").on(table.organizationId, table.clientId, table.clientSequence)],
);

export const analyticsInsights = pgTable(
  "analytics_insights",
  {
    id: idColumn(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id").references(() => branches.id, { onDelete: "cascade" }),
    type: text("type").$type<"forecast" | "stock_recommendation" | "fraud_alert" | "customer_segment" | "product_affinity" | "slow_moving" | "fast_moving">().notNull(),
    periodStart: timestamp("period_start", { withTimezone: true }),
    periodEnd: timestamp("period_end", { withTimezone: true }),
    model: text("model"),
    payload: jsonb("payload").$type<JsonValue>().notNull(),
    confidence: integer("confidence"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [index("analytics_insights_org_type_idx").on(table.organizationId, table.type)],
);

export const reportSnapshots = pgTable(
  "report_snapshots",
  {
    id: idColumn(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id").references(() => branches.id, { onDelete: "cascade" }),
    reportType: text("report_type").notNull(),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    dimensions: jsonb("dimensions").$type<Record<string, JsonValue>>().default({}),
    metrics: jsonb("metrics").$type<Record<string, JsonValue>>().notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("report_snapshots_org_type_period_idx").on(table.organizationId, table.reportType, table.periodStart)],
);
