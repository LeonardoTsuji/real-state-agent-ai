-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ReservationStrategy" AS ENUM ('ADD_PROPERTY', 'RESCHEDULE');

-- AlterTable
ALTER TABLE "brokers" ADD COLUMN     "creci" TEXT,
ADD COLUMN     "monthlyGoalCents" INTEGER NOT NULL DEFAULT 12000000;

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "profile" TEXT,
ADD COLUMN     "source" TEXT;

-- AlterTable
ALTER TABLE "properties" ADD COLUMN     "accessInfo" JSONB,
ADD COLUMN     "accessNotes" TEXT,
ADD COLUMN     "address" TEXT,
ADD COLUMN     "amenities" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "areaM2" DOUBLE PRECISION,
ADD COLUMN     "availability" TEXT,
ADD COLUMN     "bathrooms" INTEGER,
ADD COLUMN     "code" TEXT,
ADD COLUMN     "condominiumCents" INTEGER,
ADD COLUMN     "iptuCents" INTEGER,
ADD COLUMN     "media" JSONB,
ADD COLUMN     "subtype" TEXT,
ADD COLUMN     "suites" INTEGER;

-- AlterTable
ALTER TABLE "lead_property_matches" ADD COLUMN     "notes" TEXT;

-- AlterTable
ALTER TABLE "visits" ADD COLUMN     "cancellationReason" VARCHAR(1000),
ADD COLUMN     "checkedInAt" TIMESTAMPTZ(3),
ADD COLUMN     "checklist" JSONB,
ADD COLUMN     "feedback" JSONB,
ADD COLUMN     "feedbackDraft" JSONB,
ADD COLUMN     "notes" VARCHAR(2000);

-- CreateTable
CREATE TABLE "calendar_occupancies" (
    "id" UUID NOT NULL,
    "brokerId" UUID NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" UUID NOT NULL,
    "startAt" TIMESTAMPTZ(3) NOT NULL,
    "endAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "calendar_occupancies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservations" (
    "id" UUID NOT NULL,
    "brokerId" UUID NOT NULL,
    "leadId" UUID NOT NULL,
    "propertyId" UUID NOT NULL,
    "visitId" UUID,
    "strategy" "ReservationStrategy" NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'PENDING',
    "startAt" TIMESTAMPTZ(3) NOT NULL,
    "endAt" TIMESTAMPTZ(3) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "messageId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_blocks" (
    "id" UUID NOT NULL,
    "brokerId" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "startAt" TIMESTAMPTZ(3) NOT NULL,
    "endAt" TIMESTAMPTZ(3) NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calendar_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opportunities" (
    "id" UUID NOT NULL,
    "brokerId" UUID NOT NULL,
    "leadId" UUID NOT NULL,
    "propertyId" UUID,
    "alternativePropertyId" UUID,
    "stage" TEXT NOT NULL DEFAULT 'FIRST_CONTACT',
    "estimatedValueCents" INTEGER NOT NULL,
    "commissionBps" INTEGER NOT NULL DEFAULT 600,
    "title" TEXT,
    "proposal" JSONB,
    "acceptance" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "opportunities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "installments" (
    "id" UUID NOT NULL,
    "brokerId" UUID NOT NULL,
    "opportunityId" UUID NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "dueAt" TIMESTAMPTZ(3),
    "paidAt" TIMESTAMPTZ(3),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "idempotencyKey" TEXT NOT NULL,

    CONSTRAINT "installments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commercial_documents" (
    "id" UUID NOT NULL,
    "brokerId" UUID NOT NULL,
    "opportunityId" UUID,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commercial_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_import_batches" (
    "id" UUID NOT NULL,
    "brokerId" UUID NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "report" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "calendar_occupancies_brokerId_startAt_idx" ON "calendar_occupancies"("brokerId", "startAt");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_occupancies_resourceType_resourceId_key" ON "calendar_occupancies"("resourceType", "resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "reservations_idempotencyKey_key" ON "reservations"("idempotencyKey");

-- CreateIndex
CREATE INDEX "reservations_brokerId_status_expiresAt_idx" ON "reservations"("brokerId", "status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_blocks_idempotencyKey_key" ON "calendar_blocks"("idempotencyKey");

-- CreateIndex
CREATE INDEX "calendar_blocks_brokerId_startAt_idx" ON "calendar_blocks"("brokerId", "startAt");

-- CreateIndex
CREATE INDEX "opportunities_brokerId_stage_idx" ON "opportunities"("brokerId", "stage");

-- CreateIndex
CREATE UNIQUE INDEX "opportunities_id_brokerId_key" ON "opportunities"("id", "brokerId");

-- CreateIndex
CREATE UNIQUE INDEX "installments_idempotencyKey_key" ON "installments"("idempotencyKey");

-- CreateIndex
CREATE INDEX "installments_brokerId_opportunityId_idx" ON "installments"("brokerId", "opportunityId");

-- CreateIndex
CREATE INDEX "commercial_documents_brokerId_createdAt_idx" ON "commercial_documents"("brokerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "lead_import_batches_idempotencyKey_key" ON "lead_import_batches"("idempotencyKey");

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_brokerId_fkey" FOREIGN KEY ("brokerId") REFERENCES "brokers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installments" ADD CONSTRAINT "installments_brokerId_fkey" FOREIGN KEY ("brokerId") REFERENCES "brokers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installments" ADD CONSTRAINT "installments_opportunityId_brokerId_fkey" FOREIGN KEY ("opportunityId", "brokerId") REFERENCES "opportunities"("id", "brokerId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial_documents" ADD CONSTRAINT "commercial_documents_brokerId_fkey" FOREIGN KEY ("brokerId") REFERENCES "brokers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial_documents" ADD CONSTRAINT "commercial_documents_opportunityId_brokerId_fkey" FOREIGN KEY ("opportunityId", "brokerId") REFERENCES "opportunities"("id", "brokerId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_import_batches" ADD CONSTRAINT "lead_import_batches_brokerId_fkey" FOREIGN KEY ("brokerId") REFERENCES "brokers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- One schedule boundary for every source; legacy Visit writes remain protected.
ALTER TABLE calendar_occupancies ADD CONSTRAINT calendar_occupancies_interval CHECK ("endAt" > "startAt");
ALTER TABLE calendar_occupancies ADD CONSTRAINT calendar_occupancies_no_overlap EXCLUDE USING gist
 ("brokerId" WITH =, tstzrange("startAt", "endAt", '[)') WITH &&);
ALTER TABLE reservations ADD CONSTRAINT reservations_interval CHECK ("endAt" > "startAt" AND "expiresAt" <= "startAt");
ALTER TABLE reservations ADD CONSTRAINT reservations_lead_owner FOREIGN KEY ("leadId", "brokerId") REFERENCES leads(id,broker_id);
ALTER TABLE reservations ADD CONSTRAINT reservations_property_owner FOREIGN KEY ("propertyId", "brokerId") REFERENCES properties(id,broker_id);
ALTER TABLE calendar_blocks ADD CONSTRAINT calendar_blocks_interval CHECK ("endAt" > "startAt");
ALTER TABLE opportunities ADD CONSTRAINT opportunity_lead_owner FOREIGN KEY ("leadId", "brokerId") REFERENCES leads(id,broker_id);
ALTER TABLE opportunities ADD CONSTRAINT opportunity_property_owner FOREIGN KEY ("propertyId", "brokerId") REFERENCES properties(id,broker_id);
ALTER TABLE opportunities ADD CONSTRAINT opportunity_alternative_owner FOREIGN KEY ("alternativePropertyId", "brokerId") REFERENCES properties(id,broker_id);
ALTER TABLE opportunities ADD CONSTRAINT opportunity_amount CHECK ("estimatedValueCents" >= 0 AND "commissionBps" BETWEEN 0 AND 10000);
ALTER TABLE installments ADD CONSTRAINT installment_amount CHECK ("amountCents" > 0);
CREATE FUNCTION synchronize_calendar_occupancy() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE owner_id uuid; resource_id uuid; from_at timestamptz; to_at timestamptz; occupied boolean;
BEGIN
 IF TG_OP = 'DELETE' THEN
  DELETE FROM calendar_occupancies WHERE "resourceType" = TG_TABLE_NAME AND "resourceId" = OLD.id;
  RETURN OLD;
 END IF;
 resource_id := NEW.id;
 IF TG_TABLE_NAME = 'visits' THEN
  owner_id := NEW.broker_id; from_at := NEW.start_at; to_at := NEW.end_at; occupied := NEW.status = 'SCHEDULED';
 ELSIF TG_TABLE_NAME = 'reservations' THEN
  owner_id := NEW."brokerId"; from_at := NEW."startAt"; to_at := NEW."endAt"; occupied := NEW.status = 'PENDING';
 ELSE
  owner_id := NEW."brokerId"; from_at := NEW."startAt"; to_at := NEW."endAt"; occupied := true;
 END IF;
 IF occupied THEN
  INSERT INTO calendar_occupancies(id,"brokerId","resourceType","resourceId","startAt","endAt")
  VALUES (gen_random_uuid(),owner_id,TG_TABLE_NAME,resource_id,from_at,to_at)
  ON CONFLICT ("resourceType","resourceId") DO UPDATE SET "startAt"=EXCLUDED."startAt", "endAt"=EXCLUDED."endAt";
 ELSE
  DELETE FROM calendar_occupancies WHERE "resourceType"=TG_TABLE_NAME AND "resourceId"=resource_id;
 END IF;
 RETURN NEW;
END $$;
INSERT INTO calendar_occupancies(id,"brokerId","resourceType","resourceId","startAt","endAt")
 SELECT gen_random_uuid(),broker_id,'visits',id,start_at,end_at FROM visits WHERE status='SCHEDULED';
CREATE TRIGGER visit_occupancy AFTER INSERT OR UPDATE OR DELETE ON visits FOR EACH ROW EXECUTE FUNCTION synchronize_calendar_occupancy();
CREATE TRIGGER reservation_occupancy AFTER INSERT OR UPDATE OR DELETE ON reservations FOR EACH ROW EXECUTE FUNCTION synchronize_calendar_occupancy();
CREATE TRIGGER block_occupancy AFTER INSERT OR UPDATE OR DELETE ON calendar_blocks FOR EACH ROW EXECUTE FUNCTION synchronize_calendar_occupancy();

ALTER TABLE visits ADD COLUMN "rescheduleReason" VARCHAR(1000);
