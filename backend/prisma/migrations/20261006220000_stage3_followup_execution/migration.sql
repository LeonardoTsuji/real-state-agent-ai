ALTER TABLE "follow_ups" ADD COLUMN "executed_at" TIMESTAMPTZ(3);
ALTER TABLE "follow_ups" ADD COLUMN "idempotency_key" VARCHAR(200) NOT NULL;
CREATE UNIQUE INDEX "follow_ups_idempotency_key_key" ON "follow_ups"("idempotency_key");
ALTER TABLE "visits" ADD COLUMN "idempotency_key" VARCHAR(200);
UPDATE "visits" SET "idempotency_key" = 'legacy:' || "id"::text WHERE "idempotency_key" IS NULL;
ALTER TABLE "visits" ALTER COLUMN "idempotency_key" SET NOT NULL;
CREATE UNIQUE INDEX "visits_idempotency_key_key" ON "visits"("idempotency_key");
