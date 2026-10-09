CREATE TYPE "AsyncJobStatus" AS ENUM ('WAITING', 'ACTIVE', 'COMPLETED', 'FAILED', 'CANCELED');
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PUBLISHED', 'CANCELED');
CREATE TYPE "FollowUpStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELED');
CREATE TYPE "MessageStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED');

ALTER TABLE "properties" ADD COLUMN "external_key" VARCHAR(160);
CREATE UNIQUE INDEX "properties_broker_id_external_key_key" ON "properties"("broker_id", "external_key");

CREATE TABLE "async_jobs" (
  "id" UUID NOT NULL,
  "type" VARCHAR(80) NOT NULL,
  "payload_version" INTEGER NOT NULL DEFAULT 1,
  "idempotency_key" VARCHAR(200) NOT NULL,
  "aggregate_type" VARCHAR(80) NOT NULL,
  "aggregate_id" VARCHAR(120) NOT NULL,
  "payload" JSONB NOT NULL,
  "status" "AsyncJobStatus" NOT NULL DEFAULT 'WAITING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "max_attempts" INTEGER NOT NULL DEFAULT 5,
  "run_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "next_retry_at" TIMESTAMPTZ(3),
  "failure_code" VARCHAR(80),
  "failure_message" VARCHAR(240),
  "started_at" TIMESTAMPTZ(3),
  "finished_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "async_jobs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "async_jobs_idempotency_key_key" ON "async_jobs"("idempotency_key");
CREATE INDEX "async_jobs_status_run_at_idx" ON "async_jobs"("status", "run_at");
CREATE INDEX "async_jobs_aggregate_type_aggregate_id_idx" ON "async_jobs"("aggregate_type", "aggregate_id");

CREATE TABLE "outbox_events" (
  "id" UUID NOT NULL,
  "job_id" UUID NOT NULL,
  "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lease_until" TIMESTAMPTZ(3),
  "published_at" TIMESTAMPTZ(3),
  "last_error" VARCHAR(160),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "outbox_events_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "async_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "outbox_events_job_id_key" ON "outbox_events"("job_id");
CREATE INDEX "outbox_events_status_lease_until_created_at_idx" ON "outbox_events"("status", "lease_until", "created_at");

CREATE TABLE "job_receipts" (
  "id" UUID NOT NULL,
  "idempotency_key" VARCHAR(200) NOT NULL,
  "job_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "job_receipts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "job_receipts_idempotency_key_key" ON "job_receipts"("idempotency_key");

CREATE TABLE "follow_ups" (
  "id" UUID NOT NULL,
  "broker_id" UUID NOT NULL,
  "lead_id" UUID NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "due_at" TIMESTAMPTZ(3) NOT NULL,
  "timezone" VARCHAR(80) NOT NULL,
  "status" "FollowUpStatus" NOT NULL DEFAULT 'SCHEDULED',
  "job_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "follow_ups_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "follow_ups_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "brokers"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "follow_ups_lead_id_broker_id_fkey" FOREIGN KEY ("lead_id", "broker_id") REFERENCES "leads"("id", "broker_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "follow_ups_broker_id_status_due_at_idx" ON "follow_ups"("broker_id", "status", "due_at");

CREATE TABLE "property_import_batches" (
  "id" UUID NOT NULL,
  "broker_id" UUID NOT NULL,
  "idempotency_key" VARCHAR(200) NOT NULL,
  "input" JSONB NOT NULL,
  "report" JSONB,
  "job_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMPTZ(3),
  CONSTRAINT "property_import_batches_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "property_import_batches_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "brokers"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "property_import_batches_idempotency_key_key" ON "property_import_batches"("idempotency_key");
CREATE INDEX "property_import_batches_broker_id_created_at_idx" ON "property_import_batches"("broker_id", "created_at");

CREATE TABLE "conversations" (
  "id" UUID NOT NULL,
  "broker_id" UUID NOT NULL,
  "lead_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "conversations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "conversations_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "brokers"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "conversations_lead_id_broker_id_fkey" FOREIGN KEY ("lead_id", "broker_id") REFERENCES "leads"("id", "broker_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "conversations_id_broker_id_key" ON "conversations"("id", "broker_id");
CREATE INDEX "conversations_broker_id_lead_id_idx" ON "conversations"("broker_id", "lead_id");

CREATE TABLE "messages" (
  "id" UUID NOT NULL,
  "broker_id" UUID NOT NULL,
  "conversation_id" UUID NOT NULL,
  "idempotency_key" VARCHAR(200) NOT NULL,
  "body" VARCHAR(4000) NOT NULL,
  "status" "MessageStatus" NOT NULL DEFAULT 'QUEUED',
  "job_id" UUID,
  "sent_at" TIMESTAMPTZ(3),
  "failure_message" VARCHAR(240),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "messages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "messages_conversation_id_broker_id_fkey" FOREIGN KEY ("conversation_id", "broker_id") REFERENCES "conversations"("id", "broker_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "messages_idempotency_key_key" ON "messages"("idempotency_key");
CREATE INDEX "messages_broker_id_conversation_id_created_at_idx" ON "messages"("broker_id", "conversation_id", "created_at");

CREATE TABLE "simulated_calendar_events" (
  "id" UUID NOT NULL,
  "idempotency_key" VARCHAR(200) NOT NULL,
  "visit_id" UUID NOT NULL,
  "remote_id" VARCHAR(120) NOT NULL,
  "state" VARCHAR(20) NOT NULL,
  "start_at" TIMESTAMPTZ(3) NOT NULL,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "simulated_calendar_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "simulated_calendar_events_idempotency_key_key" ON "simulated_calendar_events"("idempotency_key");
CREATE UNIQUE INDEX "simulated_calendar_events_remote_id_key" ON "simulated_calendar_events"("remote_id");
