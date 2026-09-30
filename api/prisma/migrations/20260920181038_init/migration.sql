-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "avatar_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transit_stops" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "transit_stops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transit_lines" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transit_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "line_stops" (
    "id" TEXT NOT NULL,
    "line_id" TEXT NOT NULL,
    "stop_id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "minutes_from_start" INTEGER NOT NULL,

    CONSTRAINT "line_stops_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "transit_lines_code_key" ON "transit_lines"("code");

-- CreateIndex
CREATE INDEX "line_stops_stop_id_idx" ON "line_stops"("stop_id");

-- CreateIndex
CREATE UNIQUE INDEX "line_stops_line_id_sequence_key" ON "line_stops"("line_id", "sequence");

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "line_stops" ADD CONSTRAINT "line_stops_line_id_fkey" FOREIGN KEY ("line_id") REFERENCES "transit_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "line_stops" ADD CONSTRAINT "line_stops_stop_id_fkey" FOREIGN KEY ("stop_id") REFERENCES "transit_stops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
