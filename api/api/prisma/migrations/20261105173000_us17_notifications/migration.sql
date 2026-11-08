CREATE TABLE "push_devices" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expo_push_token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "push_devices_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "line_notification_subscriptions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "line_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "line_notification_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notification_deliveries" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "line_id" TEXT NOT NULL,
    "alert_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "push_devices_expo_push_token_key" ON "push_devices"("expo_push_token");
CREATE INDEX "push_devices_user_id_idx" ON "push_devices"("user_id");

CREATE UNIQUE INDEX "line_notification_subscriptions_user_id_line_id_key"
  ON "line_notification_subscriptions"("user_id", "line_id");
CREATE INDEX "line_notification_subscriptions_line_id_idx"
  ON "line_notification_subscriptions"("line_id");

CREATE UNIQUE INDEX "notification_deliveries_user_id_line_id_alert_id_key"
  ON "notification_deliveries"("user_id", "line_id", "alert_id");
CREATE INDEX "notification_deliveries_line_id_alert_id_idx"
  ON "notification_deliveries"("line_id", "alert_id");

ALTER TABLE "push_devices"
  ADD CONSTRAINT "push_devices_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "line_notification_subscriptions"
  ADD CONSTRAINT "line_notification_subscriptions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "line_notification_subscriptions"
  ADD CONSTRAINT "line_notification_subscriptions_line_id_fkey"
  FOREIGN KEY ("line_id") REFERENCES "transit_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notification_deliveries"
  ADD CONSTRAINT "notification_deliveries_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notification_deliveries"
  ADD CONSTRAINT "notification_deliveries_line_id_fkey"
  FOREIGN KEY ("line_id") REFERENCES "transit_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;
