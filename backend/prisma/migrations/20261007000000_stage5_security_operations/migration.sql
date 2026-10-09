ALTER TABLE "async_jobs" ADD COLUMN "correlation_id" VARCHAR(64);
CREATE INDEX "async_jobs_correlation_id_idx" ON "async_jobs"("correlation_id");
ALTER TABLE "tool_executions" ALTER COLUMN "conversation_id" DROP NOT NULL;
ALTER TYPE "ProposalStatus" ADD VALUE 'CONFIRMING';
ALTER TABLE "tool_executions" ADD COLUMN "model_version" VARCHAR(120);
ALTER TABLE "tool_executions" ADD COLUMN "prompt_version" VARCHAR(80);

CREATE TABLE "ai_daily_budgets" (
  "broker_id" UUID NOT NULL,
  "day" DATE NOT NULL,
  "reserved_tokens" INTEGER NOT NULL DEFAULT 0,
  "requests" INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_daily_budgets_pkey" PRIMARY KEY ("broker_id", "day"),
  CONSTRAINT "ai_daily_budgets_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "brokers"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
