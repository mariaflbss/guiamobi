import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import MapView, { MapType, Marker, Polyline } from 'react-native-maps';
import { useTranslation } from 'react-i18next';
import { useAccessibility } from '../contexts/AccessibilityContext';
import { AccessibleText } from './AccessibleText';
import { Coordinates } from '../types/location';

interface VehiclePosition {
  id: string;
  latitude: number;
  longitude: number;
}

interface PoiMarker {
  id: string;
  category: 'hospital' | 'bank' | 'square' | 'pharmacy' | 'school';
  name: string | null;
  latitude: number;
  longitude: number;
}

interface RouteMapProps {
  stops: Coordinates[];
  lineCode: string;
  boardingIndex?: number;
  destinationIndex?: number;
  /** Índice da parada atual/mais próxima dentro de `stops` (US09: "parada atual"). */
  currentStopIndex?: number;
  /** Posição do usuário (GPS do aparelho), quando houver. */
  user?: Coordinates | null;
  /** Pontos reais do traçado da linha (GTFS shapes.txt), quando disponíveis. Sem isso, nenhuma linha é desenhada entre as paradas. */
  shape?: Coordinates[];
  /** Pontos de referência reais (OpenStreetMap): hospitais, bancos, praças... */
  pois?: PoiMarker[];
  /** Endereço real (rua/número) da parada atual/próxima, mostrado ao tocar no marcador. */
  currentStopAddress?: string;
  /** Posições reais de veículos (GTFS-Realtime Vehicle Positions), quando a fonte estiver disponível. */
  vehicles?: VehiclePosition[];
  height?: number;
  accessibilityLabel: string;
  /** Texto do selo no canto inferior esquerdo (ex.: "GPS do aparelho"). */
  badge?: string;
}

const MAP_TYPES: { key: MapType; labelKey: string }[] = [
  { key: 'standard', labelKey: 'routeDetail.mapStandard' },
  { key: 'satellite', labelKey: 'routeDetail.mapSatellite' },
  { key: 'hybrid', labelKey: 'routeDetail.mapHybrid' },
];

/**
 * Mapa real da linha (US09), usando react-native-maps. Mostra as paradas
 * REAIS recebidas em `stops` (nunca coordenadas inventadas), a localização
 * do usuário quando disponível, e o traçado real da linha (GTFS
 * shapes.txt) só quando `shape` é fornecido - sem shape, nenhum traço é
 * desenhado entre as paradas, em vez de aproximar com uma linha reta que
 * pareceria um trajeto real sem ser.
 *
 * O único elemento visual novo em relação ao mapa esquemático anterior é o
 * seletor Padrão/Satélite/Híbrido; o cartão de legenda e o selo mantêm a
 * mesma aparência de antes.
 */
export function RouteMap({
  stops,
  lineCode,
  boardingIndex,
  destinationIndex,
  currentStopIndex,
  user,
  shape,
  vehicles,
  pois,
  currentStopAddress,
  height = 150,
  accessibilityLabel,
  badge,
}: RouteMapProps) {
  const { t } = useTranslation();
  const { theme } = useAccessibility();
  const c = theme.colors;
  const [mapType, setMapType] = useState<MapType>('standard');

  const initialRegion = useMemo(() => {
    const points = user ? [...stops, user] : stops;
    if (points.length === 0) return undefined;

    const lats = points.map((p) => p.latitude);
    const lons = points.map((p) => p.longitude);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);

    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLon + maxLon) / 2,
      latitudeDelta: Math.max(maxLat - minLat, 0.01) * 1.6,
      longitudeDelta: Math.max(maxLon - minLon, 0.01) * 1.6,
    };
  }, [stops, user]);

  return (
    <View
      style={[styles.container, { height }]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
    >
      {initialRegion ? (
        <MapView
          style={StyleSheet.absoluteFill}
          initialRegion={initialRegion}
          mapType={mapType}
          showsUserLocation={Boolean(user)}
          showsMyLocationButton={false}
          toolbarEnabled={false}
          accessible={false}
          importantForAccessibility="no-hide-descendants"
        >
          {shape && shape.length > 1 ? (
            <Polyline coordinates={shape} strokeColor={c.primary} strokeWidth={5} />
          ) : null}

          {stops.map((stop, index) => {
            const isBoarding = index === boardingIndex;
            const isDestination = index === destinationIndex;
            const isCurrent = index === currentStopIndex;
            const pinColor = isDestination ? c.successStrong : isBoarding || isCurrent ? c.primary : c.primaryDark;

            return (
              <Marker
                key={`${stop.latitude}-${stop.longitude}-${index}`}
                coordinate={stop}
                pinColor={pinColor}
                title={
                  isDestination
                    ? t('routeDetail.legendDestination')
                    : isBoarding
                      ? t('routeDetail.legendLine', { code: lineCode })
                      : undefined
                }
                description={isCurrent ? currentStopAddress : undefined}
              />
            );
          })}

          {(pois ?? []).map((poi) => (
            <Marker
              key={poi.id}
              coordinate={poi}
              pinColor="orange"
              title={poi.name ?? t(`routeDetail.poi.${poi.category}`)}
              description={poi.name ? t(`routeDetail.poi.${poi.category}`) : undefined}
            />
          ))}

          {(vehicles ?? []).map((vehicle) => (
            <Marker
              key={vehicle.id}
              coordinate={vehicle}
              pinColor={c.primary}
              title={t('routeDetail.legendLine', { code: lineCode })}
            />
          ))}
        </MapView>
      ) : null}

      <View style={[styles.legend, { backgroundColor: c.surface }]} accessible={false} importantForAccessibility="no-hide-descendants">
        <View style={styles.legendRow}>
          <View style={[styles.legendLine, { backgroundColor: c.primary }]} />
          <AccessibleText variant="caption" weight="bold" style={styles.legendText}>
            {t('routeDetail.legendLine', { code: lineCode })}
          </AccessibleText>
        </View>
        <View style={styles.legendRow}>
          <View style={[styles.legendDot, { backgroundColor: c.primaryDark }]} />
          <AccessibleText variant="caption" weight="bold" style={styles.legendText}>
            {t('routeDetail.legendYou')}
          </AccessibleText>
        </View>
        <View style={styles.legendRow}>
          <View style={[styles.legendDot, { backgroundColor: c.successStrong }]} />
          <AccessibleText variant="caption" weight="bold" style={styles.legendText}>
            {t('routeDetail.legendDestination')}
          </AccessibleText>
        </View>
      </View>

      {/* Único elemento visual novo autorizado nesta rodada: seletor de tipo de mapa. */}
      <View style={[styles.mapTypeSelector, { backgroundColor: c.surface }]} accessibilityRole="tablist">
        {MAP_TYPES.map((option) => {
          const selected = mapType === option.key;
          return (
            <Pressable
              key={option.key}
              onPress={() => setMapType(option.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={t(option.labelKey)}
              style={[styles.mapTypeButton, selected ? { backgroundColor: c.primary } : null]}
              hitSlop={8}
            >
              <AccessibleText variant="caption" weight="bold" color={selected ? '#FFFFFF' : c.text}>
                {t(option.labelKey)}
              </AccessibleText>
            </Pressable>
          );
        })}
      </View>

      {badge ? (
        <View style={[styles.badge, { backgroundColor: c.primaryDark }]} accessible={false} importantForAccessibility="no-hide-descendants">
          <AccessibleText variant="caption" weight="bold" color="#FFFFFF">
            {badge}
          </AccessibleText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', overflow: 'hidden' },
  legend: {
    position: 'absolute',
    top: 10,
    right: 10,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 3,
  },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendLine: { width: 14, height: 4, borderRadius: 2 },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
  legendText: { fontSize: 11 },
  badge: {
    position: 'absolute',
    left: 10,
    bottom: 10,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  mapTypeSelector: {
    position: 'absolute',
    top: 10,
    left: 10,
    flexDirection: 'row',
    borderRadius: 10,
    padding: 3,
    gap: 3,
  },
  mapTypeButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
});
