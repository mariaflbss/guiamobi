-- Índices usados pelo planner GTFS: busca por parada e, em seguida,
-- pelo par viagem+parada para localizar rapidamente o desembarque.
CREATE INDEX IF NOT EXISTS "transit_stop_times_trip_id_stop_id_idx"
  ON "transit_stop_times"("trip_id", "stop_id");

-- O planner faz filtro espacial por faixa de latitude/longitude antes do
-- Haversine. O índice composto reduz leituras desnecessárias mesmo com o feed
-- completo importado.
CREATE INDEX IF NOT EXISTS "transit_stops_latitude_longitude_idx"
  ON "transit_stops"("latitude", "longitude");
