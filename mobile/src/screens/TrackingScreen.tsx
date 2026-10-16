import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Clock3, Flag, MapPin, Repeat, X } from 'lucide-react-native';
import { ScreenContainer } from '../components/ScreenContainer';
import { AccessibleText } from '../components/AccessibleText';
import { AccessibleButton } from '../components/AccessibleButton';
import { InlineMessage } from '../components/InlineMessage';
import { Card } from '../components/Card';
import { Icon } from '../components/Icon';
import { RouteMap } from '../components/RouteMap';
import { RouteBottomSheet } from '../components/RouteBottomSheet';
import { useAccessibility } from '../contexts/AccessibilityContext';
import { useLineDetail } from '../hooks/useLineDetail';
import { useVehiclePositions } from '../hooks/useVehiclePositions';
import { useNearbyPois } from '../hooks/useNearbyPois';
import { useNearbyLines } from '../hooks/useNearbyLines';
import { useFavorites } from '../hooks/useFavorites';
import { useStopAddress } from '../hooks/useStopAddress';
import { useStatusBarStyle } from '../hooks/useStatusBarStyle';
import { locationService } from '../services/location/locationService';
import { AppStackParamList } from '../navigation/types';
import { Coordinates } from '../types/location';
import { distanceMeters } from '../utils/geo';
import { speechService } from '../services/speech/speechService';

type Props = NativeStackScreenProps<AppStackParamList, 'Tracking'>;

// Distâncias (m) usadas para os avisos e para considerar uma parada "passada"
const ALERT_DISTANCE_METERS = 200;
const ARRIVAL_DISTANCE_METERS = 40;
const PASSED_DISTANCE_METERS = 40;
const AVERAGE_BUS_METERS_PER_MINUTE = 333; // ~20 km/h

/**
 * Acompanhamento da viagem (mockup 07). A posição vem do GPS do próprio
 * aparelho (não há posição do ônibus em tempo real): a tela compara a
 * posição do usuário com as paradas reais da linha para mostrar a próxima
 * parada, quantas faltam e a distância até o destino. A ~200 m do destino
 * abre o alerta "Prepare-se!" e, ao chegar, a tela de chegada.
 */
export function TrackingScreen({ route, navigation }: Props) {
  const { t } = useTranslation();
  const { theme, announce, settings, language } = useAccessibility();
  const p = route.params;
  // A tela anterior já possui o trecho e o traçado calculados. Reutilizamos
  // esses dados para a navegação, evitando uma segunda chamada à API ao tocar
  // em "Iniciar viagem". O fallback continua sendo o carregamento normal
  // quando a tela for aberta sem dados pré-carregados.
  const prefetchedLine = useMemo(() => p.stops?.length ? {
    id: p.lineId,
    code: p.lineCode,
    name: p.lineName,
    stops: p.stops,
    shape: p.shape,
    status: 'OPERATIONAL' as const,
    delayMinutes: null,
    hasRouteData: true,
    officialSourceUrl: null,
  } : null, [p.lineId, p.lineCode, p.lineName, p.stops, p.shape]);
  const { line, isLoading, errorMessage } = useLineDetail(p.lineId, prefetchedLine);
  const { favorites } = useFavorites();
  const insets = useSafeAreaInsets();
  useStatusBarStyle('light');
  const c = theme.colors;
  const isFocused = useIsFocused();
  const { vehicles } = useVehiclePositions(p.lineId, isFocused);

  const [user, setUser] = useState<Coordinates | null>(null);
  const [simulationActive, setSimulationActive] = useState(p.simulation === true);
  const simulationElapsedRef = useRef(0);
  const [simulationProgress, setSimulationProgress] = useState(0);
  const [traveledPath, setTraveledPath] = useState<Coordinates[]>([]);
  const lastTraveledPointRef = useRef<Coordinates | null>(null);
  // Favoritos são pessoais e devem permanecer destacados no mapa independentemente
  // da distância atual do usuário. O raio de 1 km vale apenas para os POIs de orientação.
  const nearbyFavorites = favorites;
  const [permissionDenied, setPermissionDenied] = useState(false);
  const passedIndexRef = useRef<number>(-1);
  const alertedRef = useRef(false);
  const arrivedRef = useRef(false);
  const lastSpokenStopRef = useRef<string | null>(null);
  const startedAt = useRef(new Date().toISOString()).current;

  const stops = useMemo(() => line?.stops ?? [], [line]);
  const boardingIndex = stops.findIndex((s) => s.stop.id === p.boardingStopId);
  const destinationIndex = stops.findIndex((s) => s.stop.id === p.alightingStopId);

  // Prepara a mensagem crítica de 200 m desde o início da viagem. Assim,
  // quando o alerta aparecer, normalmente o MP3 já estará no cache local e
  // a fala não dependerá de uma chamada de rede naquele instante.
  useEffect(() => {
    if (destinationIndex < 0 || !stops[destinationIndex]?.stop?.name) return;
    const alertText = t('stopAlert.spoken', { name: stops[destinationIndex].stop.name });
    if (isFocused) speechService.prefetch(alertText, language);
  }, [destinationIndex, stops, language, t]);
  const ready = stops.length > 0 && boardingIndex >= 0 && destinationIndex > boardingIndex;

  const rawRouteShape = useMemo(() => {
    const shape = (line?.shape?.length ?? 0) > 1 ? line!.shape! : (p.shape && p.shape.length > 1 ? p.shape : []);
    return shape.filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude));
  }, [line?.shape, p.shape]);

  const nearestShapeIndex = useMemo(() => (point: Coordinates, shape: Coordinates[]) => {
    let best = 0;
    let bestDistance = Infinity;
    shape.forEach((candidate, index) => {
      const d = distanceMeters(point, candidate);
      if (d < bestDistance) { bestDistance = d; best = index; }
    });
    return best;
  }, []);

  // Recorta o traçado real entre embarque e destino. Assim a simulação não
  // percorre um trecho anterior/posterior da linha e nunca precisa ligar
  // paradas com uma reta artificial.
  const simulationPath = useMemo(() => {
    if (!ready) return [];
    const boarding = stops[boardingIndex].stop;
    const destination = stops[destinationIndex].stop;
    if (rawRouteShape.length > 1) {
      let a = nearestShapeIndex(boarding, rawRouteShape);
      let b = nearestShapeIndex(destination, rawRouteShape);
      if (a > b) [a, b] = [b, a];
      const sliced = rawRouteShape.slice(a, b + 1);
      if (sliced.length > 1) return sliced;
    }
    return [boarding, destination];
  }, [ready, stops, boardingIndex, destinationIndex, rawRouteShape, nearestShapeIndex]);

  // Modo demonstração: aproximadamente 20 segundos entre cada parada.
  // O intervalo maior deixa a movimentação perceptível e dá tempo para os POIs
  // serem atualizados conforme o usuário avança pelo trajeto.
  // O tempo é distribuído pelo traçado real entre as paradas, mantendo o
  // marcador sobre a geometria da rua em vez de fazê-lo saltar em linha reta.
  const stopCountForSimulation = Math.max(1, destinationIndex - boardingIndex);
  const SIMULATION_MS_PER_STOP = 20_000;
  const totalDurationMs = stopCountForSimulation * SIMULATION_MS_PER_STOP;

  const simulationStopProgress = useMemo(() => {
    if (!simulationActive || !ready || simulationPath.length < 2) return null;
    const values: number[] = [];
    for (let i = boardingIndex; i <= destinationIndex; i += 1) {
      let best = Infinity;
      let bestIndex = 0;
      for (let j = 0; j < simulationPath.length; j += 1) {
        const d = distanceMeters(stops[i].stop, simulationPath[j]);
        if (d < best) { best = d; bestIndex = j; }
      }
      values.push(bestIndex / Math.max(1, simulationPath.length - 1));
    }
    return values;
  }, [simulationActive, ready, simulationPath, boardingIndex, destinationIndex, stops]);

  useEffect(() => {
    if (!simulationActive || !isFocused || simulationPath.length < 2 || !ready) return;
    if (simulationElapsedRef.current === 0) setUser(simulationPath[0]);
    const intervalMs = 100;
    const interval = setInterval(() => {
      simulationElapsedRef.current += intervalMs;
      const elapsed = Math.min(simulationElapsedRef.current, totalDurationMs);
      const globalProgress = Math.min(1, elapsed / totalDurationMs);
      setSimulationProgress(globalProgress);

      const scaledPosition = globalProgress * (simulationPath.length - 1);
      const segment = Math.min(Math.floor(scaledPosition), simulationPath.length - 2);
      const fraction = Math.min(1, scaledPosition - segment);
      const from = simulationPath[segment];
      const to = simulationPath[segment + 1];
      setUser({
        latitude: from.latitude + (to.latitude - from.latitude) * fraction,
        longitude: from.longitude + (to.longitude - from.longitude) * fraction,
      });
      if (elapsed >= totalDurationMs) clearInterval(interval);
    }, intervalMs);
    return () => clearInterval(interval);
  }, [simulationActive, isFocused, simulationPath, ready, totalDurationMs]);

  // Mantém o histórico do trecho já percorrido para desenhar uma linha
  // acompanhando o usuário no mapa. Amostramos a cada ~15 m para não enviar
  // centenas de pontos idênticos ao WebView.
  useEffect(() => {
    if (!user) return;
    const last = lastTraveledPointRef.current;
    if (last && distanceMeters(last, user) < 15) return;
    lastTraveledPointRef.current = user;
    setTraveledPath((current) => {
      if (current.length === 0) return [user];
      return [...current, user];
    });
  }, [user]);

  // GPS real: mantém o comportamento de produção quando não estamos simulando.
  useEffect(() => {
    if (simulationActive) return;
    let stop: (() => void) | null = null;
    let cancelled = false;
    (async () => {
      let status = await locationService.getPermissionStatus();
      if (status !== 'granted') status = await locationService.requestPermission();
      if (status !== 'granted') {
        if (!cancelled) setPermissionDenied(true);
        return;
      }
      try {
        const coordinates = await locationService.getCurrentPosition();
        if (!cancelled) setUser(coordinates);
      } catch {}
      if (cancelled) return;
      const unsubscribe = await locationService.watchPosition((coordinates) => setUser(coordinates));
      if (cancelled) unsubscribe();
      else stop = unsubscribe;
    })();
    return () => { cancelled = true; stop?.(); };
  }, [simulationActive]);

  // Progresso ao longo da linha (nunca volta para trás) e próxima parada.
  const progress = useMemo(() => {
    if (!ready) return null;
    const dest = stops[destinationIndex].stop;
    const destination = { latitude: dest.latitude, longitude: dest.longitude };

    let passed = Math.max(passedIndexRef.current, boardingIndex - 1);
    if (simulationActive && simulationStopProgress) {
      for (let local = 0; local < simulationStopProgress.length - 1; local += 1) {
        if (simulationStopProgress[local] <= simulationProgress + 0.000001) {
          passed = Math.max(passed, boardingIndex + local);
        }
      }
      passed = Math.min(passed, destinationIndex - 1);
      passedIndexRef.current = passed;
    } else if (user) {
      for (let i = boardingIndex; i <= destinationIndex; i += 1) {
        const stop = stops[i].stop;
        if (distanceMeters(user, stop) <= PASSED_DISTANCE_METERS && i > passed) passed = Math.min(i, destinationIndex - 1);
      }
      passedIndexRef.current = passed;
    }

    const nextIndex = Math.min(passed + 1, destinationIndex);
    const nextStop = stops[nextIndex].stop;
    const toNext = user ? distanceMeters(user, nextStop) : null;
    const toDestination = user ? distanceMeters(user, destination) : null;

    return {
      nextIndex,
      nextName: nextStop.name,
      toNext,
      toDestination,
      remaining: Math.max(destinationIndex - passed, 0),
    };
  }, [ready, stops, boardingIndex, destinationIndex, user, simulationActive, simulationProgress, simulationStopProgress]);

  // Dados reais para o mapa (US09): POIs do OpenStreetMap ao redor do usuário e
  // endereço real (rua/número, quando o OSM tem) da próxima parada.
  const nearbyPois = useNearbyPois(user, isFocused);
  const nextStopForReference = progress ? stops[progress.nextIndex]?.stop : null;
  const nextStopPois = useNearbyPois(nextStopForReference, isFocused);
  const routePois = useMemo(() => {
    const merged = new Map<string, typeof nearbyPois[number]>();
    [...nearbyPois, ...nextStopPois].forEach((poi) => merged.set(poi.id, poi));
    return Array.from(merged.values());
  }, [nearbyPois, nextStopPois]);
  const nearbyLines = useNearbyLines(user, isFocused);
  const atStopLines = nearbyLines.filter((item) => item.stop.distanceMeters <= 40);
  const nextStopAddress = useStopAddress(progress ? stops[progress.nextIndex]?.stop : null, isFocused);

  function formatDistance(meters: number | null): string {
    if (meters === null) return '--';
    if (meters < 1000) return t('tracking.distanceMeters', { count: Math.round(meters / 10) * 10 || Math.round(meters) });
    return t('tracking.distanceKm', { value: (meters / 1000).toFixed(1).replace('.', language === 'en' ? '.' : ',') });
  }

  // Anuncia a próxima parada quando ela muda e também mantém uma orientação
  // periódica durante viagens longas (a cada 3 minutos).
  const lastPeriodicAnnouncementRef = useRef(0);
  useEffect(() => {
    if (!progress || progress.toNext === null) return;
    if (lastSpokenStopRef.current !== progress.nextName) {
      lastSpokenStopRef.current = progress.nextName;
      announce(t('tracking.spokenNext', { name: progress.nextName, distance: formatDistance(progress.toNext) }), { haptic: 'light' });
    }
  }, [progress?.nextName, progress?.toNext, announce, t]);

  useEffect(() => {
    if (!simulationActive || !progress) return;
    const elapsed = simulationElapsedRef.current;
    const interval = Math.floor(elapsed / 180000);
    if (interval > 0 && interval > lastPeriodicAnnouncementRef.current) {
      lastPeriodicAnnouncementRef.current = interval;
      announce(t('tracking.spokenProgress', {
        name: progress.nextName,
        remaining: progress.remaining,
      }), { haptic: 'light' });
    }
  }, [simulationActive, simulationProgress, progress?.nextName, progress?.remaining, announce, t]);

  // Alerta a ~200 m e chegada a ~40 m do destino
  useEffect(() => {
    if (!progress || progress.toDestination === null || !line) return;
    const destName = stops[destinationIndex].stop.name;

    // O aviso precisa acontecer antes da chegada. Se uma atualização do GPS
    // atravessar os dois limiares, o Prepare-se continua tendo prioridade.
    if (progress.toDestination <= ALERT_DISTANCE_METERS && !alertedRef.current) {
      alertedRef.current = true;
      navigation.navigate('StopAlert', { stopName: destName });
      return;
    }

    if (progress.toDestination <= ARRIVAL_DISTANCE_METERS && alertedRef.current && !arrivedRef.current) {
      arrivedRef.current = true;
      navigation.replace('Arrival', {
        placeName: p.destinationLabel ?? destName,
        trip: {
          lineCode: p.lineCode,
          lineName: p.lineName,
          destinationLabel: destName,
          durationMinutes: Math.max(1, Math.round(simulationElapsedRef.current / 60000)),
          stopsCount: Math.max(destinationIndex - boardingIndex, 0),
          startedAt,
        },
      });
      return;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress?.toDestination]);

  function repeat() {
    if (!progress) return;
    announce(t('tracking.spokenNext', { name: progress.nextName, distance: formatDistance(progress.toNext) }), { haptic: 'light' });
  }

  function cancelTrip() {
    Alert.alert(t('tracking.cancelConfirmTitle'), t('tracking.cancelConfirmMessage'), [
      { text: t('tracking.keepTrip'), style: 'cancel' },
      { text: t('tracking.cancel'), style: 'destructive', onPress: () => navigation.goBack() },
    ]);
  }

  const destinationName = ready ? stops[destinationIndex].stop.name : p.destinationLabel ?? '';
  const minutesToNext =
    progress && progress.toNext !== null ? Math.max(1, Math.round(progress.toNext / AVERAGE_BUS_METERS_PER_MINUTE)) : null;

  return (
    <ScreenContainer
      padding={0}
      header={
        <View style={[styles.header, { backgroundColor: c.primaryDark, paddingTop: insets.top + 12 }]}>
          <View style={[styles.liveDot, { backgroundColor: c.successStrong }]} accessible={false} importantForAccessibility="no-hide-descendants" />
          <AccessibleText variant="caption" weight="extrabold" color={c.onPrimary} accessibilityRole="header">
            {t('tracking.title', { code: p.lineCode })}
          </AccessibleText>
        </View>
      }
    >
      <View style={styles.root}>
        {isLoading ? <AccessibleText style={styles.pad}>{t('tracking.locating')}</AccessibleText> : null}

        {ready ? (
          <View style={styles.mapArea}>
            <RouteMap
              stops={stops.map((s) => s.stop)}
              shape={simulationActive ? simulationPath : (line?.shape ?? p.shape)}
              traveledShape={traveledPath}
              vehicles={vehicles.map((v) => ({ id: v.gtfsVehicleId, latitude: v.latitude, longitude: v.longitude }))}
              lineCode={p.lineCode}
              boardingIndex={boardingIndex}
              destinationIndex={destinationIndex}
              currentStopIndex={progress?.nextIndex}
              currentStopAddress={nextStopAddress}
              pois={routePois}
              favorites={nearbyFavorites}
              user={user}
              height={undefined}
              badge={simulationActive ? 'SIMULAÇÃO' : t('tracking.gps')}
              accessibilityLabel={t('tracking.mapLabel', { code: p.lineCode })}
            />
          </View>
        ) : null}

        {ready ? (
          <RouteBottomSheet title={t('tracking.panelTitle')} initialHeight={245} collapsedHeight={82}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.sheetContent} nestedScrollEnabled>
              {errorMessage ? <InlineMessage message={errorMessage} tone="error" /> : null}
              {permissionDenied ? <InlineMessage message={t('tracking.permissionNeeded')} tone="warning" /> : null}
              {!permissionDenied && !user ? <InlineMessage message={t('tracking.locating')} tone="info" /> : null}

              {atStopLines.length > 0 ? (
                <Card backgroundColor={c.primarySoft} borderColor={c.primary} style={styles.suggestionCard} accessible accessibilityLiveRegion="polite" accessibilityLabel={t('tracking.nearbyLinesLabel', { stop: atStopLines[0].stop.name })}>
                  <AccessibleText variant="label" color={c.primary} weight="bold">{t('tracking.atStopTitle')}</AccessibleText>
                  <AccessibleText variant="caption" color={c.textSecondary} style={styles.referenceText}>
                    {t('tracking.atStopBody')}
                  </AccessibleText>
                  <View style={styles.nearbyLinesWrap}>
                    {atStopLines.slice(0, 5).map((item) => (
                      <AccessibleButton
                        key={`${item.lineId}-${item.stop.id}`}
                        label={`${item.lineCode} — ${item.lineName}`}
                        variant="secondary"
                        onPress={() => navigation.navigate('RouteDetail', { lineId: item.lineId, lineCode: item.lineCode, lineName: item.lineName, destinationLabel: item.stop.name })}
                      />
                    ))}
                  </View>
                </Card>
              ) : null}

              {progress ? (
                <>
                  <Card backgroundColor={c.primarySoft} borderColor={c.primary} style={styles.nextCard} accessible accessibilityLabel={`${t('tracking.nextStop')}: ${progress.nextName}. ${formatDistance(progress.toNext)}${minutesToNext ? `, ${t('tracking.mins', { count: minutesToNext })}` : ''}`} accessibilityLiveRegion="polite">
                    <AccessibleText variant="label" color={c.primary} style={styles.eyebrow}>{t('tracking.nextStop')}</AccessibleText>
                    <AccessibleText variant="title" weight="extrabold" style={styles.nextName}>{progress.nextName}</AccessibleText>
                    <View style={styles.metaRow}>
                      <View style={styles.meta}><Icon icon={MapPin} size={15} color={c.textSecondary} /><AccessibleText variant="caption" weight="bold" color={c.textSecondary}>{formatDistance(progress.toNext)}</AccessibleText></View>
                      {minutesToNext ? <View style={styles.meta}><Icon icon={Clock3} size={15} color={c.textSecondary} /><AccessibleText variant="caption" weight="bold" color={c.textSecondary}>{t('tracking.mins', { count: minutesToNext })}</AccessibleText></View> : null}
                    </View>
                    {nextStopAddress ? <AccessibleText variant="caption" color={c.textSecondary} style={styles.referenceText}>{nextStopAddress}</AccessibleText> : null}
                    {nextStopPois.length > 0 ? <AccessibleText variant="caption" color={c.textSecondary} style={styles.referenceText}>{t('tracking.nearbyReference', { name: nextStopPois[0].name ?? nextStopPois[0].category })}</AccessibleText> : null}
                  </Card>

                  <View style={styles.statsRow}>
                    <Card backgroundColor={c.surfaceAlt} style={styles.statCell} accessible accessibilityLabel={`${t('tracking.remainingStops')}: ${progress.remaining}`}>
                      <AccessibleText variant="label" color={c.textSecondary} style={styles.statLabel}>{t('tracking.remainingStops')}</AccessibleText>
                      <AccessibleText variant="title" weight="extrabold" color={c.primary}>{progress.remaining}</AccessibleText>
                    </Card>
                    <Card backgroundColor={c.surfaceAlt} style={styles.statCell} accessible accessibilityLabel={`${t('tracking.untilDestination')}: ${formatDistance(progress.toDestination)}`}>
                      <AccessibleText variant="label" color={c.textSecondary} style={styles.statLabel}>{t('tracking.untilDestination')}</AccessibleText>
                      <AccessibleText variant="title" weight="extrabold" color={c.primary}>{formatDistance(progress.toDestination)}</AccessibleText>
                    </Card>
                  </View>
                </>
              ) : null}

              <Card backgroundColor={c.successBg} borderColor={c.successSoft} style={styles.destCard} accessible accessibilityLabel={`${t('tracking.destination')}: ${destinationName}`}>
                <View style={[styles.flagTile, { backgroundColor: c.successButton }]}><Icon icon={Flag} size={20} color="#FFFFFF" /></View>
                <View style={styles.flex}><AccessibleText variant="label" color={c.success} style={styles.eyebrow}>{t('tracking.destination')}</AccessibleText><AccessibleText variant="subtitle" weight="extrabold" color={c.successDark}>{destinationName}</AccessibleText></View>
              </Card>

              <View style={styles.actions}>
                <View style={styles.flex}><AccessibleButton label={t('tracking.repeat')} icon={Repeat} onPress={repeat} disabled={!progress} accessibilityHint={t('tracking.repeatHint')} /></View>
                <View style={styles.flex}><AccessibleButton label={t('tracking.cancel')} icon={X} variant="dangerSoft" onPress={cancelTrip} accessibilityHint={t('tracking.cancelHint')} /></View>
              </View>
            </ScrollView>
          </RouteBottomSheet>
        ) : null}
      </View>
    </ScreenContainer>
  );

}

const styles = StyleSheet.create({
  root: { flex: 1 },
  mapArea: { flex: 1, minHeight: 120 },
  flex: { flex: 1 },
  pad: { padding: 20, gap: 14 },
  sheetContent: { padding: 16, gap: 14, paddingBottom: 28 },
  suggestionCard: { padding: 14, borderWidth: 2 },
  nearbyLinesWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  lineChip: { minWidth: 92, paddingHorizontal: 9, paddingVertical: 7, borderRadius: 10, borderWidth: 1, gap: 1 },
  referenceText: { marginTop: 6 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingBottom: 12 },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  nextCard: { padding: 16, borderWidth: 2 },
  eyebrow: { letterSpacing: 0.7 },
  nextName: { marginTop: 4 },
  metaRow: { flexDirection: 'row', gap: 16, marginTop: 8 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statsRow: { flexDirection: 'row', gap: 12 },
  statCell: { flex: 1, padding: 14, gap: 4 },
  statLabel: { letterSpacing: 0.2 },
  destCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  flagTile: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', gap: 12, marginTop: 4 },
});
