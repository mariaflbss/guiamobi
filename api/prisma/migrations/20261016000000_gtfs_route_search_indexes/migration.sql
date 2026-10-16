-- Índices usados pela busca direta de rotas no GTFS oficial.
CREATE INDEX "transit_stop_times_stop_id_trip_id_idx"
  ON "transit_stop_times"("stop_id", "trip_id");

CREATE INDEX "transit_stop_times_trip_id_stop_id_sequence_idx"
  ON "transit_stop_times"("trip_id", "stop_id", "sequence");

CREATE INDEX "transit_trips_line_id_service_id_idx"
  ON "transit_trips"("line_id", "service_id");

CREATE INDEX "transit_stops_latitude_longitude_idx"
  ON "transit_stops"("latitude", "longitude");
