import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import MapView, { Callout, Marker, Polyline, UrlTile } from 'react-native-maps';
import { useTranslation } from 'react-i18next';
import { useAccessibility } from '../contexts/AccessibilityContext';
import { AccessibleText } from './AccessibleText';
import { useConnectivity } from '../hooks/useConnectivity';
import { offlineMapService } from '../services/storage/offlineMapService';
import { speechService } from '../services/speech/speechService';
import {
  MAP_MARKER_COLORS,
  MapFavorite,
  MapPoi,
  MapStop,
  MapVehicle,
  evaluateShape,
} from './map/mapPayload';
import { Coordinates } from '../types/location';

interface RouteMapProps {
  stops: MapStop[];
  lineCode: string;
  boardingIndex?: number;
  destinationIndex?: number;
  currentStopIndex?: number;
  user?: Coordinates | null;
  shape?: Coordinates[];
  traveledShape?: Coordinates[];
  pois?: MapPoi[];
  favorites?: MapFavorite[];
  currentStopAddress?: string;
  vehicles?: MapVehicle[];
  height?: number;
  accessibilityLabel: string;
  badge?: string;
  offlineRegionKey?: string | null;
  /** Exibe as paradas intermediárias somente durante a navegação iniciada. */
  showIntermediateStops?: boolean;
}

const MAP_TYPES = [
  { key: 'standard', labelKey: 'routeDetail.mapStandard' },
  { key: 'satellite', labelKey: 'routeDetail.mapSatellite' },
  { key: 'hybrid', labelKey: 'routeDetail.mapHybrid' },
] as const;

type MapTypeKey = (typeof MAP_TYPES)[number]['key'];

type MarkerKind =
  | 'you'
  | 'origin'
  | 'destination'
  | 'stop'
  | 'favorite'
  | 'poi'
  | 'vehicle';

const ONLINE_MIN_ZOOM = 3;
const ONLINE_MAX_ZOOM = 19;

function validCoordinate(point?: Coordinates | null): point is Coordinates {
  return Boolean(
    point &&
      Number.isFinite(point.latitude) &&
      Number.isFinite(point.longitude) &&
      Math.abs(point.latitude) <= 90 &&
      Math.abs(point.longitude) <= 180,
  );
}

function uniqueCoordinates(points: Coordinates[]): Coordinates[] {
  const seen = new Set<string>();
  const result: Coordinates[] = [];

  for (const point of points) {
    if (!validCoordinate(point)) continue;
    const key = `${point.latitude.toFixed(6)}:${point.longitude.toFixed(6)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(point);
  }

  return result;
}

function markerColor(kind: MarkerKind): string {
  switch (kind) {
    case 'you':
      return MAP_MARKER_COLORS.you;
    case 'origin':
      return MAP_MARKER_COLORS.origin;
    case 'destination':
      return MAP_MARKER_COLORS.destination;
    case 'favorite':
      return MAP_MARKER_COLORS.favorite;
    case 'poi':
      return MAP_MARKER_COLORS.poi;
    case 'vehicle':
      return '#374151';
    default:
      return MAP_MARKER_COLORS.stop;
  }
}

function markerSize(kind: MarkerKind): number {
  switch (kind) {
    case 'you':
      return 15;
    case 'origin':
    case 'destination':
      return 9;
    case 'stop':
      return 7;
    case 'favorite':
      return 10;
    case 'poi':
      return 18;
    case 'vehicle':
      return 7;
  }
}

function MarkerVisual({ kind }: { kind: MarkerKind }) {
  const size = markerSize(kind);
  const color = markerColor(kind);

  return (
    <View
      style={[
        styles.markerHitBox,
        {
          width: Math.max(44, size + 18),
          height: Math.max(44, size + 18),
        },
      ]}
    >
      <View
        style={[
          styles.markerDot,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: color,
            borderColor: '#FFFFFF',
            borderWidth: kind === 'stop' ? 1.5 : 2,
          },
        ]}
      />
    </View>
  );
}

function CalloutText({ lines }: { lines: string[] }) {
  return (
    <View style={styles.callout}>
      {lines.filter(Boolean).map((line, index) => (
        <AccessibleText
          key={`${line}-${index}`}
          variant={index === 0 ? 'label' : 'caption'}
          weight={index === 0 ? 'extrabold' : 'bold'}
        >
          {line}
        </AccessibleText>
      ))}
    </View>
  );
}

export function RouteMap({
  stops,
  lineCode,
  boardingIndex,
  destinationIndex,
  currentStopIndex,
  user,
  shape,
  traveledShape,
  vehicles,
  pois,
  favorites,
  currentStopAddress,
  height,
  accessibilityLabel,
  badge,
  offlineRegionKey,
  showIntermediateStops = false,
}: RouteMapProps) {
  const { t } = useTranslation();
  const { theme, speak, stopSpeech, language } = useAccessibility();
  const { isConnected } = useConnectivity();
  const c = theme.colors;

  const mapRef = useRef<MapView | null>(null);
  const fittedRef = useRef(false);
  const [mapType, setMapType] = useState<MapTypeKey>('standard');
  const [offlineReady, setOfflineReady] = useState(false);
  const [offlineTileTemplate, setOfflineTileTemplate] = useState<string | null>(null);
  const [offlineMinZoom, setOfflineMinZoom] = useState(12);
  const [offlineMaxZoom, setOfflineMaxZoom] = useState(15);

  const hasStops = stops.length > 0;
  const evaluatedShape = useMemo(
    () => evaluateShape(shape, stops),
    [shape, stops],
  );
  const realShape = evaluatedShape.status === 'ok' ? evaluatedShape.points : [];
  const offlineMapMode = !isConnected && offlineReady && Boolean(offlineTileTemplate);

  const poiLabels = useMemo(
    () => ({
      hospital: t('routeDetail.poi.hospital'),
      clinic: t('routeDetail.poi.clinic'),
      pharmacy: t('routeDetail.poi.pharmacy'),
      dentist: t('routeDetail.poi.dentist'),
      bank: t('routeDetail.poi.bank'),
      atm: t('routeDetail.poi.atm'),
      square: t('routeDetail.poi.square'),
    }),
    [t],
  );

  const favoriteCategoryLabels = useMemo(
    () => ({
      home: t('favorites.kinds.home'),
      school: t('favorites.kinds.school'),
      work: t('favorites.kinds.work'),
      health: t('favorites.kinds.health'),
      other: t('favorites.kinds.other'),
    }),
    [t],
  );

  useEffect(() => {
    let cancelled = false;

    if (!offlineRegionKey) {
      setOfflineReady(false);
      setOfflineTileTemplate(null);
      setOfflineMinZoom(12);
      setOfflineMaxZoom(15);
      return () => {
        cancelled = true;
      };
    }

    void Promise.all([
      offlineMapService.hasRegion(offlineRegionKey),
      offlineMapService.getRegionTileTemplate(offlineRegionKey),
      offlineMapService.getRegionMinZoom(offlineRegionKey),
      offlineMapService.getRegionMaxZoom(offlineRegionKey),
    ])
      .then(([hasRegion, template, minZoom, maxZoom]) => {
        if (cancelled) return;

        setOfflineReady(hasRegion && Boolean(template));
        setOfflineTileTemplate(hasRegion ? template : null);
        if (minZoom != null && Number.isFinite(minZoom)) setOfflineMinZoom(minZoom);
        if (maxZoom != null && Number.isFinite(maxZoom)) setOfflineMaxZoom(maxZoom);
      })
      .catch(() => {
        if (cancelled) return;
        setOfflineReady(false);
        setOfflineTileTemplate(null);
      });

    return () => {
      cancelled = true;
    };
  }, [offlineRegionKey]);

  useEffect(() => {
    if (isConnected) return;
    if (mapType !== 'standard') setMapType('standard');
  }, [isConnected, mapType]);

  const fitCoordinates = useMemo(() => {
    const points = [
      ...stops,
      ...realShape,
      ...(favorites ?? []).map((favorite) => ({
        latitude: favorite.latitude,
        longitude: favorite.longitude,
      })),
      ...(user ? [user] : []),
    ];

    return uniqueCoordinates(points);
  }, [stops, realShape, favorites, user]);

  const fitSignature = useMemo(
    () => JSON.stringify(fitCoordinates),
    [fitCoordinates],
  );

  const fitMap = useCallback(() => {
    const map = mapRef.current;
    if (!map || !fitCoordinates.length) return;

    if (fitCoordinates.length === 1) {
      map.animateCamera(
        {
          center: fitCoordinates[0],
          zoom: 16,
        },
        { duration: 0 },
      );
      fittedRef.current = true;
      return;
    }

    map.fitToCoordinates(fitCoordinates, {
      edgePadding: { top: 70, right: 55, bottom: 90, left: 55 },
      animated: false,
    });
    fittedRef.current = true;
  }, [fitCoordinates]);

  useEffect(() => {
    if (!hasStops) return;
    fittedRef.current = false;
  }, [fitSignature, hasStops]);

  const zoom = useCallback(async (delta: number) => {
    const map = mapRef.current;
    if (!map) return;

    try {
      const camera = await map.getCamera();
      const currentZoom = Number(camera.zoom ?? (offlineMapMode ? offlineMinZoom : 14));
      const minZoom = offlineMapMode ? offlineMinZoom : ONLINE_MIN_ZOOM;
      const maxZoom = offlineMapMode ? offlineMaxZoom : ONLINE_MAX_ZOOM;
      const nextZoom = Math.max(minZoom, Math.min(maxZoom, currentZoom + delta));

      if (nextZoom === currentZoom) return;

      await map.animateCamera(
        {
          center: camera.center,
          zoom: nextZoom,
        },
        { duration: 180 },
      );
    } catch {
      // O mapa continua utilizável mesmo quando o comando programático não está disponível.
    }
  }, [offlineMapMode, offlineMinZoom, offlineMaxZoom]);

  const speakMarker = useCallback(
    (text: string) => {
      stopSpeech();
      if (text.trim()) speechService.prefetch(text, language);
      speak(text);
    },
    [language, speak, stopSpeech],
  );

  const renderMarker = useCallback(
    ({
      coordinate,
      kind,
      lines,
      speechText,
      identifier,
    }: {
      coordinate: Coordinates;
      kind: MarkerKind;
      lines: string[];
      speechText?: string;
      identifier: string;
    }) => (
      <Marker
        key={identifier}
        identifier={identifier}
        coordinate={coordinate}
        anchor={{ x: 0.5, y: 0.5 }}
        tracksViewChanges={false}
        onPress={() => {
          if (speechText) speakMarker(speechText);
        }}
      >
        <MarkerVisual kind={kind} />
        {lines.length > 0 ? (
          <Callout onPress={() => speechText && speakMarker(speechText)}>
            <CalloutText lines={lines} />
          </Callout>
        ) : null}
      </Marker>
    ),
    [speakMarker],
  );

  const stopMarkers = stops
    .map((stop, index) => ({ stop, index }))
    .filter(({ index }) =>
      showIntermediateStops ||
      index === boardingIndex ||
      index === destinationIndex
    )
    .map(({ stop, index }) => {
    const destination = index === destinationIndex;
    const boarding = index === boardingIndex;
    const current = index === currentStopIndex;

    const role = destination
      ? t('routeDetail.legendDestination')
      : boarding
        ? t('routeDetail.legendOrigin')
        : t('routeDetail.mapStop');

    const title =
      destination || boarding
        ? stop.name
          ? `${role}: ${stop.name}`
          : role
        : stop.name || `${role} ${index + 1}`;

    const lines = [
      title,
      current && currentStopAddress ? currentStopAddress : '',
    ];

    return renderMarker({
      coordinate: stop,
      kind: destination ? 'destination' : boarding ? 'origin' : 'stop',
      lines,
      speechText: lines.filter(Boolean).join('. '),
      identifier: `stop-${index}-${stop.latitude}-${stop.longitude}`,
    });
  });

  const favoriteMarkers = (favorites ?? []).map((favorite) => {
    const category = favorite.category
      ? favoriteCategoryLabels[favorite.category as keyof typeof favoriteCategoryLabels] ?? ''
      : '';
    const title = favorite.nickname || t('routeDetail.favoritePlace');
    const lines = [title, category, favorite.address].filter(Boolean);

    return renderMarker({
      coordinate: {
        latitude: favorite.latitude,
        longitude: favorite.longitude,
      },
      kind: 'favorite',
      lines,
      speechText: lines.join('. '),
      identifier: `favorite-${favorite.id}`,
    });
  });

  const poiMarkers = (pois ?? []).map((poi) => {
    const category = poiLabels[poi.category];
    const name = poi.name || t('routeDetail.unnamedPoi');
    const lines = [name, category].filter(Boolean);

    return renderMarker({
      coordinate: {
        latitude: poi.latitude,
        longitude: poi.longitude,
      },
      kind: 'poi',
      lines,
      speechText: lines.join('. '),
      identifier: `poi-${poi.id}`,
    });
  });

  const vehicleMarkers = (vehicles ?? [])
    .filter(validCoordinate)
    .map((vehicle) =>
      renderMarker({
        coordinate: vehicle,
        kind: 'vehicle',
        lines: [t('routeDetail.legendLine', { code: lineCode })],
        speechText: t('routeDetail.legendLine', { code: lineCode }),
        identifier: `vehicle-${vehicle.id}`,
      }),
    );

  const userMarker = validCoordinate(user)
    ? renderMarker({
        coordinate: user,
        kind: 'you',
        lines: [t('routeDetail.legendYou')],
        speechText: t('routeDetail.legendYou'),
        identifier: 'user',
      })
    : null;

  return (
    <View style={height == null ? styles.flexContainer : { width: '100%', height }}>
      <View
        style={[
          styles.container,
          height == null ? styles.flexContainer : { height, width: '100%' },
          { backgroundColor: c.surface },
        ]}
        accessible
        accessibilityRole="image"
        accessibilityLabel={accessibilityLabel}
      >
        {hasStops ? (
          <MapView
            ref={mapRef}
            style={StyleSheet.absoluteFill}
            mapType={offlineMapMode ? 'none' : mapType}
            minZoomLevel={offlineMapMode ? offlineMinZoom : ONLINE_MIN_ZOOM}
            maxZoomLevel={offlineMapMode ? offlineMaxZoom : ONLINE_MAX_ZOOM}
            zoomEnabled
            scrollEnabled
            rotateEnabled={false}
            pitchEnabled={false}
            toolbarEnabled={false}
            moveOnMarkerPress={false}
            showsCompass={false}
            showsScale={false}
            showsBuildings={false}
            showsTraffic={false}
            loadingEnabled
            loadingBackgroundColor={c.surface}
            onMapReady={() => {
              if (!fittedRef.current) fitMap();
            }}
          >
            {offlineMapMode && offlineTileTemplate ? (
              <UrlTile
                urlTemplate={offlineTileTemplate}
                minimumZ={offlineMinZoom}
                maximumZ={offlineMaxZoom}
                maximumNativeZ={offlineMaxZoom}
                tileSize={256}
                zIndex={1}
              />
            ) : null}

            {realShape.length > 1 ? (
              <Polyline
                coordinates={realShape}
                strokeColor={MAP_MARKER_COLORS.line}
                strokeWidth={4}
                lineCap="round"
                lineJoin="round"
                zIndex={2}
              />
            ) : null}

            {traveledShape && traveledShape.length > 1 ? (
              <Polyline
                coordinates={traveledShape}
                strokeColor={MAP_MARKER_COLORS.line}
                strokeWidth={6}
                lineCap="round"
                lineJoin="round"
                zIndex={3}
              />
            ) : null}

            {stopMarkers}
            {favoriteMarkers}
            {poiMarkers}
            {vehicleMarkers}
            {userMarker}
          </MapView>
        ) : null}

        {offlineMapMode === false && !isConnected && offlineRegionKey ? (
          <View
            style={[styles.offlineUnavailable, { backgroundColor: c.surface }]}
            pointerEvents="none"
            accessibilityLiveRegion="polite"
          >
            <AccessibleText variant="caption" weight="bold" color={c.textSecondary}>
              {t('routeDetail.mapUnavailable')}
            </AccessibleText>
          </View>
        ) : null}

        <View
          style={[styles.legend, { backgroundColor: c.surface }]}
          accessible={false}
          importantForAccessibility="no-hide-descendants"
        >
          {user ? (
            <LegendDot color={MAP_MARKER_COLORS.you} label={t('routeDetail.legendYou')} />
          ) : null}

          {boardingIndex != null && boardingIndex >= 0 ? (
            <LegendDot color={MAP_MARKER_COLORS.origin} label={t('routeDetail.legendOrigin')} />
          ) : null}

          {destinationIndex != null && destinationIndex >= 0 ? (
            <LegendDot color={MAP_MARKER_COLORS.destination} label={t('routeDetail.legendDestination')} />
          ) : null}

          {favorites && favorites.length > 0 ? (
            <LegendDot color={MAP_MARKER_COLORS.favorite} label={t('routeDetail.legendFavorite')} />
          ) : null}

          {showIntermediateStops && stops.length > 2 ? (
            <LegendDot color={MAP_MARKER_COLORS.stop} label={t('routeDetail.mapStop')} />
          ) : null}
        </View>

        <View
          style={[styles.mapTypeSelector, { backgroundColor: c.surface }]}
          accessibilityRole="tablist"
        >
          {MAP_TYPES.map((option) => {
            const selected = mapType === option.key;
            const disabled = !isConnected && option.key !== 'standard';

            return (
              <Pressable
                key={option.key}
                onPress={() => {
                  if (!disabled) setMapType(option.key);
                }}
                disabled={disabled}
                accessibilityRole="tab"
                accessibilityState={{ selected, disabled }}
                accessibilityLabel={t(option.labelKey)}
                style={[
                  styles.mapTypeButton,
                  selected ? { backgroundColor: c.primary } : null,
                  disabled ? styles.mapTypeButtonDisabled : null,
                ]}
                hitSlop={8}
              >
                <AccessibleText
                  variant="caption"
                  weight="bold"
                  color={selected ? '#FFFFFF' : disabled ? c.textSecondary : c.text}
                >
                  {t(option.labelKey)}
                </AccessibleText>
              </Pressable>
            );
          })}
        </View>

        <View
          style={[styles.zoomControls, { backgroundColor: c.surface }]}
          accessibilityRole="toolbar"
          accessibilityLabel={t('routeDetail.zoomControls')}
        >
          <Pressable
            onPress={() => void zoom(1)}
            accessibilityRole="button"
            accessibilityLabel={t('routeDetail.zoomIn')}
            style={[styles.zoomButton, { borderBottomColor: c.border }]}
            hitSlop={6}
          >
            <AccessibleText variant="title" weight="extrabold" color={c.text}>
              +
            </AccessibleText>
          </Pressable>
          <Pressable
            onPress={() => void zoom(-1)}
            accessibilityRole="button"
            accessibilityLabel={t('routeDetail.zoomOut')}
            style={styles.zoomButton}
            hitSlop={6}
          >
            <AccessibleText variant="title" weight="extrabold" color={c.text}>
              −
            </AccessibleText>
          </Pressable>
        </View>

        {badge ? (
          <View
            style={[styles.badge, { backgroundColor: c.primaryDark }]}
            accessible={false}
            importantForAccessibility="no-hide-descendants"
          >
            <AccessibleText variant="caption" weight="bold" color="#FFFFFF">
              {badge}
            </AccessibleText>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendRow}>
      <View style={[styles.legendDot, { backgroundColor: color, borderColor: '#FFFFFF' }]} />
      <AccessibleText variant="caption" weight="bold" style={styles.legendText}>
        {label}
      </AccessibleText>
    </View>
  );
}

const styles = StyleSheet.create({
  flexContainer: {
    flex: 1,
    minHeight: 120,
  },
  container: {
    width: '100%',
    overflow: 'hidden',
  },
  markerHitBox: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerDot: {
    position: 'absolute',
  },
  callout: {
    minWidth: 150,
    maxWidth: 280,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 3,
  },
  offlineUnavailable: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 10,
    opacity: 0.96,
  },
  legend: {
    position: 'absolute',
    top: 10,
    right: 10,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 3,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendLine: {
    width: 14,
    height: 4,
    borderRadius: 2,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
  },
  legendText: {
    fontSize: 11,
  },
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
  mapTypeButtonDisabled: {
    opacity: 0.55,
  },
  zoomControls: {
    position: 'absolute',
    top: 51,
    left: 10,
    width: 42,
    borderRadius: 10,
    overflow: 'hidden',
    elevation: 5,
    shadowOpacity: 0.14,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  zoomButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
