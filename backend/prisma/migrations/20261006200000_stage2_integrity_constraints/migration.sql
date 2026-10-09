-- Reinforce invariants at the database boundary, including existing stage-1 rows.
ALTER TABLE "properties"
  ADD CONSTRAINT "properties_positive_price_check" CHECK ("price_cents" > 0),
  ADD CONSTRAINT "properties_nonnegative_rooms_check" CHECK ("bedrooms" >= 0),
  ADD CONSTRAINT "properties_nonnegative_parking_check" CHECK ("parking_spaces" >= 0);

ALTER TABLE "lead_preferences"
  ADD CONSTRAINT "lead_preferences_nonnegative_bedrooms_check"
    CHECK (("min_bedrooms" IS NULL OR "min_bedrooms" >= 0) AND ("max_bedrooms" IS NULL OR "max_bedrooms" >= 0)),
  ADD CONSTRAINT "lead_preferences_nonnegative_parking_check"
    CHECK (("min_parking_spaces" IS NULL OR "min_parking_spaces" >= 0) AND ("max_parking_spaces" IS NULL OR "max_parking_spaces" >= 0));

ALTER TABLE "visits"
  DROP CONSTRAINT "visits_cancellation_metadata_check",
  ADD CONSTRAINT "visits_cancellation_metadata_check"
    CHECK (("status" = 'CANCELED' AND "canceled_at" IS NOT NULL AND "canceled_by_id" = "broker_id") OR ("status" <> 'CANCELED' AND "canceled_at" IS NULL AND "canceled_by_id" IS NULL));

ALTER TABLE "lead_stage_history"
  ADD CONSTRAINT "lead_stage_history_actor_matches_owner_check" CHECK ("actor_id" = "broker_id"),
  ADD CONSTRAINT "lead_stage_history_distinct_stages_check" CHECK ("from_stage" IS NULL OR "from_stage" <> "to_stage");

ALTER TABLE "audit_logs"
  ADD CONSTRAINT "audit_logs_actor_matches_owner_check" CHECK ("actor_id" = "broker_id");
