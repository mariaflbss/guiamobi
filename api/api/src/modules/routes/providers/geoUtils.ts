/** Distância em metros entre duas coordenadas (fórmula de Haversine). */
export function haversineDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const earthRadiusMeters = 6371000;
  const toRad = (value: number) => (value * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusMeters * c;
}

export function estimateWalkMinutes(distanceMeters: number): number {
  const walkSpeedMetersPerMinute = 80; // ~4,8 km/h
  return distanceMeters / walkSpeedMetersPerMinute;
}

/**
 * Delta em graus de latitude/longitude equivalente a uma distância em
 * metros, usado para um filtro de "bounding box" barato no banco antes do
 * cálculo preciso por Haversine em memória. Importante para o
 * GtfsDatabaseProvider poder escalar para uma rede GTFS completa (milhares
 * de paradas) sem varrer a tabela inteira a cada busca.
 */
export function boundingBoxDeltas(latitude: number, radiusMeters: number) {
  const metersPerDegreeLat = 111320;
  const metersPerDegreeLon = 111320 * Math.cos((latitude * Math.PI) / 180);

  return {
    deltaLat: radiusMeters / metersPerDegreeLat,
    deltaLon: radiusMeters / Math.max(metersPerDegreeLon, 1), // evita divisão por ~0 nos polos
  };
}
