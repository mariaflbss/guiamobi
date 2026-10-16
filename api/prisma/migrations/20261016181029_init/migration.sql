/*
  Warnings:

  - A unique constraint covering the columns `[code,data_source]` on the table `transit_lines` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "transit_lines_code_data_source_idx";

-- DropIndex
DROP INDEX "transit_stop_times_stop_id_trip_id_idx";

-- DropIndex
DROP INDEX "transit_stop_times_trip_id_stop_id_sequence_idx";

-- DropIndex
DROP INDEX "transit_stops_latitude_longitude_idx";

-- DropIndex
DROP INDEX "transit_trips_line_id_service_id_idx";

-- CreateIndex
CREATE UNIQUE INDEX "transit_lines_code_data_source_key" ON "transit_lines"("code", "data_source");
