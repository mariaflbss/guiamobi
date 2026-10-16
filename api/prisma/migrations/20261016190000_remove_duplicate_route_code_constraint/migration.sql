-- route_short_name (code) is display data, not a unique identifier.
-- The official SJC GTFS contains duplicate route_short_name values (for example LV).
-- route_id is represented by TransitLine.gtfs_route_id and is the unique identity.
DROP INDEX IF EXISTS "transit_lines_code_data_source_key";
