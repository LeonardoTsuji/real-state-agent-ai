CREATE TYPE "MessageRole" AS ENUM ('USER', 'ASSISTANT', 'TOOL');
CREATE TYPE "ProposalStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED', 'EXPIRED');


ALTER TABLE "messages" ADD COLUMN "role" "MessageRole" NOT NULL DEFAULT 'ASSISTANT';

CREATE TABLE "tool_executions" (
  "id" UUID NOT NULL,
  "broker_id" UUID NOT NULL,
  "conversation_id" UUID NOT NULL,
  "correlation_id" VARCHAR(120) NOT NULL,
  "tool_name" VARCHAR(80) NOT NULL,
  "status" VARCHAR(24) NOT NULL,
  "result_code" VARCHAR(80),
  "duration_ms" INTEGER NOT NULL,
  "token_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tool_executions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "tool_executions_broker_id_conversation_id_created_at_idx" ON "tool_executions"("broker_id", "conversation_id", "created_at");
ALTER TABLE "tool_executions" ADD CONSTRAINT "tool_executions_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "brokers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tool_executions" ADD CONSTRAINT "tool_executions_conversation_id_broker_id_fkey" FOREIGN KEY ("conversation_id", "broker_id") REFERENCES "conversations"("id", "broker_id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "action_proposals" (
  "id" UUID NOT NULL,
  "broker_id" UUID NOT NULL,
  "conversation_id" UUID NOT NULL,
  "action_type" VARCHAR(80) NOT NULL,
  "arguments" JSONB NOT NULL,
  "arguments_hash" VARCHAR(64) NOT NULL,
  "summary" VARCHAR(500) NOT NULL,
  "status" "ProposalStatus" NOT NULL DEFAULT 'PENDING',
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "idempotency_key" VARCHAR(200) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "action_proposals_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "action_proposals_idempotency_key_key" ON "action_proposals"("idempotency_key");
CREATE INDEX "action_proposals_broker_id_conversation_id_status_expires_at_idx" ON "action_proposals"("broker_id", "conversation_id", "status", "expires_at");
ALTER TABLE "action_proposals" ADD CONSTRAINT "action_proposals_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "brokers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "action_proposals" ADD CONSTRAINT "action_proposals_conversation_id_broker_id_fkey" FOREIGN KEY ("conversation_id", "broker_id") REFERENCES "conversations"("id", "broker_id") ON DELETE RESTRICT ON UPDATE CASCADE;
