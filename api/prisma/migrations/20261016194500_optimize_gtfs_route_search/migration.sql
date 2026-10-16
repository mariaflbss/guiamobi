-- Índices para a busca de horários futuros por parada e para filtrar viagens
-- por serviço ativo no dia. O objetivo é reduzir leitura de stop_times no
-- PostgreSQL antes dos dados chegarem ao Node.js.
CREATE INDEX "transit_stop_times_stop_id_departure_time_idx"
  ON "transit_stop_times"("stop_id", "departure_time");

CREATE INDEX "transit_trips_service_id_line_id_idx"
  ON "transit_trips"("service_id", "line_id");

CREATE INDEX "transit_calendar_exceptions_date_exception_type_service_id_idx"
  ON "transit_calendar_exceptions"("date", "exception_type", "service_id");
