-- CreateEnum
CREATE TYPE "TransitLineStatusValue" AS ENUM ('OPERATIONAL', 'DELAYED', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "TransitDayType" AS ENUM ('WEEKDAY', 'SATURDAY', 'SUNDAY_HOLIDAY');

-- AlterTable
-- Marca se a linha vem de uma fonte oficial (GTFS/operadora) ou é dado de
-- demonstração. Linhas existentes (seed antigo) são marcadas como NÃO
-- oficiais por padrão, para não serem apresentadas como transporte real.
ALTER TABLE "transit_lines" ADD COLUMN "is_official_data" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "transit_line_status" (
    "id" TEXT NOT NULL,
    "line_id" TEXT NOT NULL,
    "status" "TransitLineStatusValue" NOT NULL DEFAULT 'OPERATIONAL',
    "delay_minutes" INTEGER,
    "reason" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transit_line_status_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transit_departures" (
    "id" TEXT NOT NULL,
    "line_id" TEXT NOT NULL,
    "day_type" "TransitDayType" NOT NULL,
    "departure_time" TEXT NOT NULL,

    CONSTRAINT "transit_departures_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "transit_line_status_line_id_key" ON "transit_line_status"("line_id");

-- CreateIndex
CREATE INDEX "transit_departures_line_id_day_type_idx" ON "transit_departures"("line_id", "day_type");

-- AddForeignKey
ALTER TABLE "transit_line_status" ADD CONSTRAINT "transit_line_status_line_id_fkey" FOREIGN KEY ("line_id") REFERENCES "transit_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transit_departures" ADD CONSTRAINT "transit_departures_line_id_fkey" FOREIGN KEY ("line_id") REFERENCES "transit_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;
