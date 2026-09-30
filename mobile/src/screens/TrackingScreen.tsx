import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
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
import { useAccessibility } from '../contexts/AccessibilityContext';
import { useLineDetail } from '../hooks/useLineDetail';
import { useVehiclePositions } from '../hooks/useVehiclePositions';
import { useNearbyPois } from '../hooks/useNearbyPois';
import { useStopAddress } from '../hooks/useStopAddress';
import { useStatusBarStyle } from '../hooks/useStatusBarStyle';
import { locationService } from '../services/location/locationService';
import { AppStackParamList } from '../navigation/types';
import { Coordinates } from '../types/location';
import { distanceMeters } from '../utils/geo';

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
  const { line, isLoading, errorMessage } = useLineDetail(p.lineId);
  const { vehicles } = useVehiclePositions(p.lineId);
  const insets = useSafeAreaInsets();
  useStatusBarStyle('light');
  const c = theme.colors;

  const [user, setUser] = useState<Coordinates | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const passedIndexRef = useRef<number>(-1);
  const alertedRef = useRef(false);
  const arrivedRef = useRef(false);
  const lastSpokenStopRef = useRef<string | null>(null);
  const startedAt = useRef(new Date().toISOString()).current;

  const stops = useMemo(() => line?.stops ?? [], [line]);
  const boardingIndex = stops.findIndex((s) => s.stop.id === p.boardingStopId);
  const destinationIndex = stops.findIndex((s) => s.stop.id === p.alightingStopId);
  const ready = stops.length > 0 && boardingIndex >= 0 && destinationIndex > boardingIndex;

  // Acompanha a posição do aparelho enquanto a tela está aberta
  useEffect(() => {
    let stop: (() => void) | null = null;
    let cancelled = false;

    (async () => {
      let status = await locationService.getPermissionStatus();
      if (status !== 'granted') status = await locationService.requestPermission();
      if (status !== 'granted') {
        if (!cancelled) setPermissionDenied(true);
        return;
      }
      const unsubscribe = await locationService.watchPosition((coordinates) => setUser(coordinates));
      if (cancelled) unsubscribe();
      else stop = unsubscribe;
    })();

    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);

  // Progresso ao longo da linha (nunca volta para trás) e próxima parada
  const progress = useMemo(() => {
    if (!ready) return null;
    const dest = stops[destinationIndex].stop;
    const destination = { latitude: dest.latitude, longitude: dest.longitude };

    let passed = Math.max(passedIndexRef.current, boardingIndex - 1);
    if (user) {
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
      remaining: Math.max(destinationIndex - passed, 1),
    };
  }, [ready, stops, boardingIndex, destinationIndex, user]);

  // Dados reais para o mapa (US09): POIs do OpenStreetMap ao redor do usuário e
  // endereço real (rua/número, quando o OSM tem) da próxima parada.
  const nearbyPois = useNearbyPois(user);
  const nextStopAddress = useStopAddress(progress ? stops[progress.nextIndex]?.stop : null);

  function formatDistance(meters: number | null): string {
    if (meters === null) return '--';
    if (meters < 1000) return t('tracking.distanceMeters', { count: Math.round(meters / 10) * 10 || Math.round(meters) });
    return t('tracking.distanceKm', { value: (meters / 1000).toFixed(1).replace('.', language === 'en' ? '.' : ',') });
  }

  // Anuncia a próxima parada quando ela muda
  useEffect(() => {
    if (!progress || progress.toNext === null) return;
    if (lastSpokenStopRef.current === progress.nextName) return;
    lastSpokenStopRef.current = progress.nextName;
    announce(t('tracking.spokenNext', { name: progress.nextName, distance: formatDistance(progress.toNext) }), { haptic: 'light' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress?.nextName, progress?.toNext === null]);

  // Alerta a ~200 m e chegada a ~40 m do destino
  useEffect(() => {
    if (!progress || progress.toDestination === null || !line) return;
    const destName = stops[destinationIndex].stop.name;

    if (progress.toDestination <= ARRIVAL_DISTANCE_METERS && !arrivedRef.current) {
      arrivedRef.current = true;
      navigation.replace('Arrival', {
        placeName: p.destinationLabel ?? destName,
        trip: {
          lineCode: p.lineCode,
          lineName: p.lineName,
          destinationLabel: destName,
          durationMinutes: p.durationMinutes ?? null,
          stopsCount: p.stopsCount ?? null,
          startedAt,
        },
      });
      return;
    }

    if (progress.toDestination <= ALERT_DISTANCE_METERS && !alertedRef.current) {
      alertedRef.current = true;
      navigation.navigate('StopAlert', { stopName: destName });
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
      scroll
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
      {isLoading ? <AccessibleText style={styles.pad}>{t('tracking.locating')}</AccessibleText> : null}

      {ready ? (
        <RouteMap
          stops={stops.map((s) => s.stop)}
          shape={line?.shape}
          vehicles={vehicles.map((v) => ({ id: v.gtfsVehicleId, latitude: v.latitude, longitude: v.longitude }))}
          lineCode={p.lineCode}
          boardingIndex={boardingIndex}
          destinationIndex={destinationIndex}
          currentStopIndex={progress?.nextIndex}
          currentStopAddress={nextStopAddress}
          pois={nearbyPois}
          user={user}
          height={settings.simpleMode ? 110 : 170}
          badge={t('tracking.gps')}
          accessibilityLabel={t('tracking.mapLabel', { code: p.lineCode })}
        />
      ) : null}

      <View style={styles.pad}>
        {errorMessage ? <InlineMessage message={errorMessage} tone="error" /> : null}
        {permissionDenied ? <InlineMessage message={t('tracking.permissionNeeded')} tone="warning" /> : null}
        {!permissionDenied && !user && ready ? <InlineMessage message={t('tracking.locating')} tone="info" /> : null}

        {progress ? (
          <>
            <Card
              backgroundColor={c.primarySoft}
              borderColor={c.primary}
              style={styles.nextCard}
              accessible
              accessibilityLabel={`${t('tracking.nextStop')}: ${progress.nextName}. ${formatDistance(progress.toNext)}${
                minutesToNext ? `, ${t('tracking.mins', { count: minutesToNext })}` : ''
              }`}
              accessibilityLiveRegion="polite"
            >
              <AccessibleText variant="label" color={c.primary} style={styles.eyebrow}>
                {t('tracking.nextStop')}
              </AccessibleText>
              <AccessibleText variant="title" weight="extrabold" style={styles.nextName}>
                {progress.nextName}
              </AccessibleText>
              <View style={styles.metaRow}>
                <View style={styles.meta}>
                  <Icon icon={MapPin} size={15} color={c.textSecondary} />
                  <AccessibleText variant="caption" weight="bold" color={c.textSecondary}>
                    {formatDistance(progress.toNext)}
                  </AccessibleText>
                </View>
                {minutesToNext ? (
                  <View style={styles.meta}>
                    <Icon icon={Clock3} size={15} color={c.textSecondary} />
                    <AccessibleText variant="caption" weight="bold" color={c.textSecondary}>
                      {t('tracking.mins', { count: minutesToNext })}
                    </AccessibleText>
                  </View>
                ) : null}
              </View>
            </Card>

            <View style={styles.statsRow}>
              <Card backgroundColor={c.surfaceAlt} style={styles.statCell} accessible accessibilityLabel={`${t('tracking.remainingStops')}: ${progress.remaining}`}>
                <AccessibleText variant="label" color={c.textSecondary} style={styles.statLabel}>
                  {t('tracking.remainingStops')}
                </AccessibleText>
                <AccessibleText variant="title" weight="extrabold" color={c.primary}>
                  {progress.remaining}
                </AccessibleText>
              </Card>
              <Card backgroundColor={c.surfaceAlt} style={styles.statCell} accessible accessibilityLabel={`${t('tracking.untilDestination')}: ${formatDistance(progress.toDestination)}`}>
                <AccessibleText variant="label" color={c.textSecondary} style={styles.statLabel}>
                  {t('tracking.untilDestination')}
                </AccessibleText>
                <AccessibleText variant="title" weight="extrabold" color={c.primary}>
                  {formatDistance(progress.toDestination)}
                </AccessibleText>
              </Card>
            </View>
          </>
        ) : null}

        <Card backgroundColor={c.successBg} borderColor={c.successSoft} style={styles.destCard} accessible accessibilityLabel={`${t('tracking.destination')}: ${destinationName}`}>
          <View style={[styles.flagTile, { backgroundColor: c.successButton }]}>
            <Icon icon={Flag} size={20} color="#FFFFFF" />
          </View>
          <View style={styles.flex}>
            <AccessibleText variant="label" color={c.success} style={styles.eyebrow}>
              {t('tracking.destination')}
            </AccessibleText>
            <AccessibleText variant="subtitle" weight="extrabold" color={c.successDark}>
              {destinationName}
            </AccessibleText>
          </View>
        </Card>

        <View style={styles.actions}>
          <View style={styles.flex}>
            <AccessibleButton
              label={t('tracking.repeat')}
              icon={Repeat}
              onPress={repeat}
              disabled={!progress}
              accessibilityHint={t('tracking.repeatHint')}
            />
          </View>
          <View style={styles.flex}>
            <AccessibleButton
              label={t('tracking.cancel')}
              icon={X}
              variant="dangerSoft"
              onPress={cancelTrip}
              accessibilityHint={t('tracking.cancelHint')}
            />
          </View>
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pad: { padding: 20, gap: 14 },
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
