import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { useTranslation } from 'react-i18next';
import { useAccessibility } from '../contexts/AccessibilityContext';
import { AccessibleText } from './AccessibleText';
import { MAP_REFERER_URL } from '../constants/config';
import { MAP_HTML } from './map/mapHtml';
import {
  buildMapData,
  buildPageCall,
  MAP_MARKER_COLORS,
  MapPoi,
  MapFavorite,
  MapStop,
  MapVehicle,
  normalizeBaseUrl,
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
  pois?: MapPoi[];
  favorites?: MapFavorite[];
  currentStopAddress?: string;
  vehicles?: MapVehicle[];
  height?: number;
  accessibilityLabel: string;
  badge?: string;
}

const MAP_TYPES = [
  { key: 'standard', labelKey: 'routeDetail.mapStandard' },
  { key: 'satellite', labelKey: 'routeDetail.mapSatellite' },
  { key: 'hybrid', labelKey: 'routeDetail.mapHybrid' },
] as const;
type MapTypeKey = (typeof MAP_TYPES)[number]['key'];

// Origem do documento do WebView: faz o Android enviar o Referer exigido pelos
// servidores de tiles do OpenStreetMap (sem ele, os tiles vêm bloqueados/vazios).
const MAP_BASE_URL = normalizeBaseUrl(MAP_REFERER_URL);

/**
 * Mapa real compatível com Expo Go (Android e iOS), sem Google Maps, sem chave
 * de API e sem módulo nativo extra: Leaflet embutido no app, desenhado dentro
 * de um WebView (react-native-webview já faz parte do Expo Go).
 *
 * - Mapa padrão: OpenStreetMap (com servidores de reserva automáticos).
 * - Satélite/Híbrido: Esri World Imagery.
 * - GPS: continua vindo do expo-location (nas telas); aqui só é desenhado.
 * - Os dados são enviados à página por injectJavaScript: o mapa NÃO recarrega a
 *   cada posição de GPS/veículo, e o zoom escolhido pela pessoa é preservado.
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
  favorites,
  currentStopAddress,
  height,
  accessibilityLabel,
  badge,
}: RouteMapProps) {
  const { t } = useTranslation();
  const { theme, speak } = useAccessibility();
  const c = theme.colors;
  const [mapType, setMapType] = useState<MapTypeKey>('standard');
  const [readyCount, setReadyCount] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);
  const [loadFailed, setLoadFailed] = useState(false);
  const webViewRef = useRef<WebView>(null);
  const hasStops = stops.length > 0;

  // Comando "setData" (paradas, linha, POIs, veículos). É uma string: o efeito
  // abaixo só roda quando o CONTEÚDO muda, mesmo que as telas recriem os arrays.
  const mapData = hasStops
    ? buildMapData({
        stops,
        shape,
        pois,
        favorites,
        vehicles,
        boardingIndex,
        destinationIndex,
        currentStopIndex,
        currentStopAddress,
        colors: { line: c.primary, ...MAP_MARKER_COLORS },
        labels: {
          line: t('routeDetail.legendLine', { code: lineCode }),
          you: t('routeDetail.legendYou'),
          origin: t('routeDetail.legendOrigin'),
          destination: t('routeDetail.legendDestination'),
          stop: t('routeDetail.mapStop'),
          address: t('routeDetail.mapAddress'),
          mapUnavailable: t('routeDetail.mapUnavailable'),
          unnamedPoi: t('routeDetail.unnamedPoi'),
          favorite: t('routeDetail.favoritePlace'),
          poi: {
            hospital: t('routeDetail.poi.hospital'),
            clinic: t('routeDetail.poi.clinic'),
            pharmacy: t('routeDetail.poi.pharmacy'),
            dentist: t('routeDetail.poi.dentist'),
            bank: t('routeDetail.poi.bank'),
            atm: t('routeDetail.poi.atm'),
            supermarket: t('routeDetail.poi.supermarket'),
            square: t('routeDetail.poi.square'),
          },
        },
      })
    : null;
  const dataScript = mapData ? buildPageCall('setData', mapData) : '';
  // Traçado real só existe se passou na validação; senão a linha fica ausente e avisamos.
  const hasRealShape = mapData?.shapeStatus === 'ok';

  const run = useCallback((script: string) => {
    webViewRef.current?.injectJavaScript(script);
  }, []);

  // A página avisa "ready" (e onLoadEnd também): cada nova carga reenvia tudo.
  const markReady = useCallback(() => setReadyCount((n) => n + 1), []);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const message = JSON.parse(event.nativeEvent.data);
        if (message?.type === 'ready') markReady();
        if (message?.type === 'speak' && typeof message.text === 'string') speak(message.text);
      } catch {
        // mensagem que não é do mapa: ignora
      }
    },
    [markReady]
  );

  // Impede que um toque nos créditos do mapa (links) navegue o WebView para fora do mapa.
  const allowNavigation = useCallback((request: { url: string }) => {
    const url = request.url ?? '';
    if (!url || url === 'about:blank' || url.startsWith('data:') || url.startsWith(MAP_BASE_URL)) return true;
    if (/^https?:/i.test(url)) Linking.openURL(url).catch(() => undefined);
    return false;
  }, []);

  useEffect(() => {
    if (readyCount > 0 && dataScript) {
      setLoadFailed(false);
      run(dataScript);
    }
  }, [readyCount, dataScript, run]);

  const userLat = user?.latitude;
  const userLon = user?.longitude;
  useEffect(() => {
    if (readyCount === 0) return;
    run(buildPageCall('setUser', userLat != null && userLon != null ? [userLat, userLon] : null));
  }, [readyCount, userLat, userLon, run]);

  useEffect(() => {
    if (readyCount > 0) run(buildPageCall('setMapType', mapType));
  }, [readyCount, mapType, run]);

  return (
    <View style={height == null ? styles.flexContainer : undefined}>
    <View style={[styles.container, height == null ? styles.flexContainer : { height }]} accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
      {hasStops ? (
        <WebView
          key={reloadKey}
          ref={webViewRef}
          style={StyleSheet.absoluteFill}
          originWhitelist={['*']}
          source={{ html: MAP_HTML, baseUrl: MAP_BASE_URL }}
          javaScriptEnabled
          domStorageEnabled
          startInLoadingState
          scrollEnabled={false}
          bounces={false}
          overScrollMode="never"
          nestedScrollEnabled
          setSupportMultipleWindows={false}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          geolocationEnabled={false}
          accessibilityLabel={accessibilityLabel}
          onMessage={handleMessage}
          onLoadEnd={markReady}
          onError={() => setLoadFailed(true)}
          onRenderProcessGone={() => {
            setLoadFailed(false);
            setReloadKey((k) => k + 1);
          }}
          onShouldStartLoadWithRequest={allowNavigation}
        />
      ) : null}

      {loadFailed ? (
        <View style={[styles.failure, { backgroundColor: c.surface }]} accessibilityLiveRegion="polite">
          <AccessibleText variant="caption" weight="bold" style={styles.failureText}>{t('routeDetail.mapUnavailable')}</AccessibleText>
        </View>
      ) : null}

      <View style={[styles.legend, { backgroundColor: c.surface }]} accessible={false} importantForAccessibility="no-hide-descendants">
        {hasRealShape ? (
          <View style={styles.legendRow}>
            <View style={[styles.legendLine, { backgroundColor: c.primary }]} />
            <AccessibleText variant="caption" weight="bold" style={styles.legendText}>{t('routeDetail.legendLine', { code: lineCode })}</AccessibleText>
          </View>
        ) : null}
        {user ? (
          <View style={styles.legendRow}>
            <View style={[styles.legendDot, { backgroundColor: MAP_MARKER_COLORS.you, borderColor: '#FFFFFF' }]} />
            <AccessibleText variant="caption" weight="bold" style={styles.legendText}>{t('routeDetail.legendYou')}</AccessibleText>
          </View>
        ) : null}
        {boardingIndex != null && boardingIndex >= 0 ? (
          <View style={styles.legendRow}>
            <View style={[styles.legendDot, { backgroundColor: MAP_MARKER_COLORS.origin, borderColor: MAP_MARKER_COLORS.originRing, borderWidth: 2.5 }]} />
            <AccessibleText variant="caption" weight="bold" style={styles.legendText}>{t('routeDetail.legendOrigin')}</AccessibleText>
          </View>
        ) : null}
        {destinationIndex != null && destinationIndex >= 0 ? (
          <View style={styles.legendRow}>
            <View style={[styles.legendDot, { backgroundColor: MAP_MARKER_COLORS.destination, borderColor: '#FFFFFF' }]} />
            <AccessibleText variant="caption" weight="bold" style={styles.legendText}>{t('routeDetail.legendDestination')}</AccessibleText>
          </View>
        ) : null}
        {pois && pois.length > 0 ? (
          <View style={styles.legendRow}>
            <View style={[styles.legendDot, { backgroundColor: MAP_MARKER_COLORS.poi, borderColor: '#FFFFFF' }]} />
            <AccessibleText variant="caption" weight="bold" style={styles.legendText}>{t('routeDetail.legendPoi')}</AccessibleText>
          </View>
        ) : null}
        {favorites && favorites.length > 0 ? (
          <View style={styles.legendRow}>
            <View style={[styles.legendDot, { backgroundColor: MAP_MARKER_COLORS.favorite, borderColor: '#FFFFFF' }]} />
            <AccessibleText variant="caption" weight="bold" style={styles.legendText}>{t('routeDetail.legendFavorite')}</AccessibleText>
          </View>
        ) : null}
      </View>

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
              <AccessibleText variant="caption" weight="bold" color={selected ? '#FFFFFF' : c.text}>{t(option.labelKey)}</AccessibleText>
            </Pressable>
          );
        })}
      </View>

      {badge ? (
        <View style={[styles.badge, { backgroundColor: c.primaryDark }]} accessible={false} importantForAccessibility="no-hide-descendants">
          <AccessibleText variant="caption" weight="bold" color="#FFFFFF">{badge}</AccessibleText>
        </View>
      ) : null}
    </View>

    </View>
  );
}

const styles = StyleSheet.create({
  flexContainer: { flex: 1, minHeight: 120 },
  container: { width: '100%', overflow: 'hidden' },
  legend: { position: 'absolute', top: 10, right: 10, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, gap: 3 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendLine: { width: 14, height: 4, borderRadius: 2 },
  legendDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2 },
  legendText: { fontSize: 11 },
  badge: { position: 'absolute', left: 10, bottom: 10, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  mapTypeSelector: { position: 'absolute', top: 10, left: 10, flexDirection: 'row', borderRadius: 10, padding: 3, gap: 3 },
  mapTypeButton: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  failure: { position: 'absolute', left: 12, right: 12, top: '40%', borderRadius: 10, padding: 10 },
  failureText: { textAlign: 'center' },
});
