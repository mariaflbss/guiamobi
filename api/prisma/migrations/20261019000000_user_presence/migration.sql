CREATE TABLE "user_presence" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_presence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_presence_user_id_key" ON "user_presence"("user_id");
CREATE INDEX "user_presence_updated_at_idx" ON "user_presence"("updated_at");

ALTER TABLE "user_presence"
ADD CONSTRAINT "user_presence_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
