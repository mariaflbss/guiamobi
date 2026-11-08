-- CreateEnum
CREATE TYPE "TransitDataSource" AS ENUM ('DEV_FIXTURE', 'OFFICIAL_GTFS');

-- CreateTable
CREATE TABLE "transit_agencies" (
    "id" TEXT NOT NULL,
    "gtfs_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT,
    "timezone" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transit_agencies_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "transit_agencies_gtfs_id_key" ON "transit_agencies"("gtfs_id");

-- AlterTable transit_stops: colunas do GTFS stops.txt
ALTER TABLE "transit_stops" ADD COLUMN "gtfs_stop_id" TEXT;
ALTER TABLE "transit_stops" ADD COLUMN "stop_code" TEXT;
CREATE UNIQUE INDEX "transit_stops_gtfs_stop_id_key" ON "transit_stops"("gtfs_stop_id");

-- AlterTable transit_lines: dataSource + colunas do GTFS routes.txt
ALTER TABLE "transit_lines" ADD COLUMN "data_source" "TransitDataSource" NOT NULL DEFAULT 'DEV_FIXTURE';
ALTER TABLE "transit_lines" ADD COLUMN "gtfs_route_id" TEXT;
ALTER TABLE "transit_lines" ADD COLUMN "route_type" INTEGER;
ALTER TABLE "transit_lines" ADD COLUMN "agency_id" TEXT;
CREATE UNIQUE INDEX "transit_lines_gtfs_route_id_key" ON "transit_lines"("gtfs_route_id");
ALTER TABLE "transit_lines" ADD CONSTRAINT "transit_lines_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "transit_agencies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- O código de linha (ex.: "101") deixa de ser globalmente único: o mesmo
-- número real pode existir tanto na fixture de desenvolvimento quanto, mais
-- tarde, num GTFS oficial importado, até a fixture ser desativada. A partir
-- de agora só (code, data_source) precisa ser único.
DROP INDEX IF EXISTS "transit_lines_code_key";
CREATE UNIQUE INDEX "transit_lines_code_data_source_key" ON "transit_lines"("code", "data_source");

-- Dados já existentes (seed manual) são explicitamente marcados como fixture
-- de desenvolvimento, nunca "GTFS oficial" (default já cobre isso, mas
-- deixamos explícito por clareza em bancos que já tinham linhas antes desta
-- migration).
UPDATE "transit_lines" SET "data_source" = 'DEV_FIXTURE';

-- CreateTable
CREATE TABLE "transit_services" (
    "id" TEXT NOT NULL,
    "gtfs_service_id" TEXT NOT NULL,
    "monday" BOOLEAN NOT NULL,
    "tuesday" BOOLEAN NOT NULL,
    "wednesday" BOOLEAN NOT NULL,
    "thursday" BOOLEAN NOT NULL,
    "friday" BOOLEAN NOT NULL,
    "saturday" BOOLEAN NOT NULL,
    "sunday" BOOLEAN NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transit_services_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "transit_services_gtfs_service_id_key" ON "transit_services"("gtfs_service_id");

-- CreateTable
CREATE TABLE "transit_calendar_exceptions" (
    "id" TEXT NOT NULL,
    "service_id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "exception_type" INTEGER NOT NULL,

    CONSTRAINT "transit_calendar_exceptions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "transit_calendar_exceptions_service_id_date_key" ON "transit_calendar_exceptions"("service_id", "date");
ALTER TABLE "transit_calendar_exceptions" ADD CONSTRAINT "transit_calendar_exceptions_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "transit_services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "transit_shapes" (
    "id" TEXT NOT NULL,
    "gtfs_shape_id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "dist_traveled" DOUBLE PRECISION,

    CONSTRAINT "transit_shapes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "transit_shapes_gtfs_shape_id_sequence_key" ON "transit_shapes"("gtfs_shape_id", "sequence");
CREATE INDEX "transit_shapes_gtfs_shape_id_idx" ON "transit_shapes"("gtfs_shape_id");

-- CreateTable
CREATE TABLE "transit_trips" (
    "id" TEXT NOT NULL,
    "gtfs_trip_id" TEXT NOT NULL,
    "line_id" TEXT NOT NULL,
    "service_id" TEXT NOT NULL,
    "headsign" TEXT,
    "direction_id" INTEGER,
    "gtfs_shape_id" TEXT,

    CONSTRAINT "transit_trips_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "transit_trips_gtfs_trip_id_key" ON "transit_trips"("gtfs_trip_id");
CREATE INDEX "transit_trips_line_id_idx" ON "transit_trips"("line_id");
CREATE INDEX "transit_trips_service_id_idx" ON "transit_trips"("service_id");
ALTER TABLE "transit_trips" ADD CONSTRAINT "transit_trips_line_id_fkey" FOREIGN KEY ("line_id") REFERENCES "transit_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "transit_trips" ADD CONSTRAINT "transit_trips_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "transit_services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "transit_stop_times" (
    "id" TEXT NOT NULL,
    "trip_id" TEXT NOT NULL,
    "stop_id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "arrival_time" TEXT NOT NULL,
    "departure_time" TEXT NOT NULL,

    CONSTRAINT "transit_stop_times_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "transit_stop_times_trip_id_sequence_key" ON "transit_stop_times"("trip_id", "sequence");
CREATE INDEX "transit_stop_times_stop_id_idx" ON "transit_stop_times"("stop_id");
CREATE INDEX "transit_stop_times_trip_id_idx" ON "transit_stop_times"("trip_id");
ALTER TABLE "transit_stop_times" ADD CONSTRAINT "transit_stop_times_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "transit_trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "transit_stop_times" ADD CONSTRAINT "transit_stop_times_stop_id_fkey" FOREIGN KEY ("stop_id") REFERENCES "transit_stops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
