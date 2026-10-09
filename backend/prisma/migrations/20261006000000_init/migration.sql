-- CreateEnum
CREATE TYPE "PropertyPurpose" AS ENUM ('SALE', 'RENT');

-- CreateEnum
CREATE TYPE "PropertyType" AS ENUM ('APARTMENT', 'HOUSE', 'LAND', 'COMMERCIAL');

-- CreateTable
CREATE TABLE "brokers" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "brokers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" UUID NOT NULL,
    "broker_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "email" VARCHAR(254),
    "phone" VARCHAR(20),
    "notes" VARCHAR(2000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "properties" (
    "id" UUID NOT NULL,
    "broker_id" UUID NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "description" VARCHAR(5000),
    "purpose" "PropertyPurpose" NOT NULL,
    "type" "PropertyType" NOT NULL,
    "price_cents" INTEGER NOT NULL,
    "city" VARCHAR(120) NOT NULL,
    "neighborhood" VARCHAR(120) NOT NULL,
    "bedrooms" INTEGER NOT NULL,
    "parking_spaces" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "properties_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "brokers_email_key" ON "brokers"("email");

-- CreateIndex
CREATE INDEX "leads_broker_id_created_at_id_idx" ON "leads"("broker_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "properties_broker_id_created_at_id_idx" ON "properties"("broker_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "properties_broker_id_purpose_type_price_cents_idx" ON "properties"("broker_id", "purpose", "type", "price_cents");

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "brokers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "brokers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

