-- CreateEnum
CREATE TYPE "LeadStage" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'VISIT_SCHEDULED', 'NEGOTIATION', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('SUGGESTED', 'SENT', 'INTERESTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "VisitStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELED');

-- CreateEnum
CREATE TYPE "InteractionType" AS ENUM ('CALL', 'EMAIL', 'WHATSAPP', 'MEETING', 'NOTE', 'OTHER');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'COMPLETED', 'CANCELED');

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "deleted_at" TIMESTAMPTZ(3),
ADD COLUMN     "stage" "LeadStage" NOT NULL DEFAULT 'NEW';

-- AlterTable
ALTER TABLE "properties" ADD COLUMN     "deleted_at" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "lead_preferences" (
    "id" UUID NOT NULL,
    "broker_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "purposes" "PropertyPurpose"[] DEFAULT ARRAY[]::"PropertyPurpose"[],
    "types" "PropertyType"[] DEFAULT ARRAY[]::"PropertyType"[],
    "min_price_cents" INTEGER,
    "max_price_cents" INTEGER,
    "min_bedrooms" INTEGER,
    "max_bedrooms" INTEGER,
    "min_parking_spaces" INTEGER,
    "max_parking_spaces" INTEGER,
    "neighborhoods" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" VARCHAR(2000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "lead_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_property_matches" (
    "id" UUID NOT NULL,
    "broker_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "score" INTEGER NOT NULL,
    "status" "MatchStatus" NOT NULL DEFAULT 'SUGGESTED',
    "rejection_reason" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "lead_property_matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visits" (
    "id" UUID NOT NULL,
    "broker_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "start_at" TIMESTAMPTZ(3) NOT NULL,
    "end_at" TIMESTAMPTZ(3) NOT NULL,
    "status" "VisitStatus" NOT NULL DEFAULT 'SCHEDULED',
    "canceled_at" TIMESTAMPTZ(3),
    "canceled_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interactions" (
    "id" UUID NOT NULL,
    "broker_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "type" "InteractionType" NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "summary" VARCHAR(2000) NOT NULL,
    "channel" VARCHAR(80),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL,
    "broker_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "due_at" TIMESTAMPTZ(3) NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_stage_history" (
    "id" UUID NOT NULL,
    "broker_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "from_stage" "LeadStage",
    "to_stage" "LeadStage" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_stage_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "broker_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "entity_type" VARCHAR(80) NOT NULL,
    "entity_id" UUID NOT NULL,
    "action" VARCHAR(40) NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "request_id" VARCHAR(120),
    "changes" JSONB,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lead_preferences_lead_id_key" ON "lead_preferences"("lead_id");

-- CreateIndex
CREATE INDEX "lead_preferences_broker_id_lead_id_idx" ON "lead_preferences"("broker_id", "lead_id");

-- CreateIndex
CREATE UNIQUE INDEX "lead_preferences_lead_id_broker_id_key" ON "lead_preferences"("lead_id", "broker_id");

-- CreateIndex
CREATE INDEX "lead_property_matches_broker_id_lead_id_created_at_id_idx" ON "lead_property_matches"("broker_id", "lead_id", "created_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "lead_property_matches_lead_id_property_id_key" ON "lead_property_matches"("lead_id", "property_id");

-- CreateIndex
CREATE INDEX "visits_broker_id_start_at_id_idx" ON "visits"("broker_id", "start_at", "id");

-- CreateIndex
CREATE INDEX "visits_broker_id_status_start_at_idx" ON "visits"("broker_id", "status", "start_at");

-- CreateIndex
CREATE INDEX "interactions_broker_id_lead_id_occurred_at_id_idx" ON "interactions"("broker_id", "lead_id", "occurred_at", "id");

-- CreateIndex
CREATE INDEX "tasks_broker_id_status_due_at_id_idx" ON "tasks"("broker_id", "status", "due_at", "id");

-- CreateIndex
CREATE INDEX "tasks_broker_id_lead_id_status_due_at_idx" ON "tasks"("broker_id", "lead_id", "status", "due_at");

-- CreateIndex
CREATE INDEX "lead_stage_history_broker_id_lead_id_created_at_id_idx" ON "lead_stage_history"("broker_id", "lead_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "audit_logs_broker_id_occurred_at_id_idx" ON "audit_logs"("broker_id", "occurred_at", "id");

-- CreateIndex
CREATE INDEX "audit_logs_broker_id_entity_type_entity_id_occurred_at_idx" ON "audit_logs"("broker_id", "entity_type", "entity_id", "occurred_at");

-- CreateIndex
CREATE INDEX "leads_broker_id_stage_deleted_at_idx" ON "leads"("broker_id", "stage", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "leads_id_broker_id_key" ON "leads"("id", "broker_id");

-- CreateIndex
CREATE UNIQUE INDEX "properties_id_broker_id_key" ON "properties"("id", "broker_id");

-- AddForeignKey
ALTER TABLE "lead_preferences" ADD CONSTRAINT "lead_preferences_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "brokers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_preferences" ADD CONSTRAINT "lead_preferences_lead_id_broker_id_fkey" FOREIGN KEY ("lead_id", "broker_id") REFERENCES "leads"("id", "broker_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_property_matches" ADD CONSTRAINT "lead_property_matches_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "brokers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_property_matches" ADD CONSTRAINT "lead_property_matches_lead_id_broker_id_fkey" FOREIGN KEY ("lead_id", "broker_id") REFERENCES "leads"("id", "broker_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_property_matches" ADD CONSTRAINT "lead_property_matches_property_id_broker_id_fkey" FOREIGN KEY ("property_id", "broker_id") REFERENCES "properties"("id", "broker_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "brokers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_lead_id_broker_id_fkey" FOREIGN KEY ("lead_id", "broker_id") REFERENCES "leads"("id", "broker_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_property_id_broker_id_fkey" FOREIGN KEY ("property_id", "broker_id") REFERENCES "properties"("id", "broker_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_canceled_by_id_fkey" FOREIGN KEY ("canceled_by_id") REFERENCES "brokers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "brokers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_lead_id_broker_id_fkey" FOREIGN KEY ("lead_id", "broker_id") REFERENCES "leads"("id", "broker_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "brokers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_lead_id_broker_id_fkey" FOREIGN KEY ("lead_id", "broker_id") REFERENCES "leads"("id", "broker_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_stage_history" ADD CONSTRAINT "lead_stage_history_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "brokers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_stage_history" ADD CONSTRAINT "lead_stage_history_lead_id_broker_id_fkey" FOREIGN KEY ("lead_id", "broker_id") REFERENCES "leads"("id", "broker_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "lead_stage_history" ADD CONSTRAINT "lead_stage_history_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "brokers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "brokers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "brokers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Database checks for invariants that must hold outside the HTTP layer too.
ALTER TABLE "lead_preferences"
  ADD CONSTRAINT "lead_preferences_price_range_check" CHECK ("min_price_cents" IS NULL OR "max_price_cents" IS NULL OR "min_price_cents" <= "max_price_cents"),
  ADD CONSTRAINT "lead_preferences_bedrooms_range_check" CHECK ("min_bedrooms" IS NULL OR "max_bedrooms" IS NULL OR "min_bedrooms" <= "max_bedrooms"),
  ADD CONSTRAINT "lead_preferences_parking_range_check" CHECK ("min_parking_spaces" IS NULL OR "max_parking_spaces" IS NULL OR "min_parking_spaces" <= "max_parking_spaces"),
  ADD CONSTRAINT "lead_preferences_nonnegative_check" CHECK ("min_price_cents" IS NULL OR "min_price_cents" >= 0);
ALTER TABLE "lead_property_matches"
  ADD CONSTRAINT "lead_property_matches_score_check" CHECK ("score" BETWEEN 0 AND 100),
  ADD CONSTRAINT "lead_property_matches_rejection_reason_check" CHECK ("status" = 'REJECTED' OR "rejection_reason" IS NULL);
ALTER TABLE "visits"
  ADD CONSTRAINT "visits_positive_duration_check" CHECK ("start_at" < "end_at"),
  ADD CONSTRAINT "visits_cancellation_metadata_check" CHECK (("status" = 'CANCELED' AND "canceled_at" IS NOT NULL AND "canceled_by_id" IS NOT NULL) OR ("status" <> 'CANCELED' AND "canceled_at" IS NULL AND "canceled_by_id" IS NULL));

-- Exclusion constraint serializes reservation integrity in PostgreSQL; [) permits adjacency.
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "visits"
  ADD CONSTRAINT "visits_no_broker_overlap"
  EXCLUDE USING gist (
    "broker_id" WITH =,
    tstzrange("start_at", "end_at", '[)') WITH &&
  ) WHERE ("status" = 'SCHEDULED');
