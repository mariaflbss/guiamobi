-- route_short_name may repeat across data sources.
-- Keep uniqueness scoped by source during the transition; the later migration
-- removes this constraint completely because GTFS route_id is the identity.

