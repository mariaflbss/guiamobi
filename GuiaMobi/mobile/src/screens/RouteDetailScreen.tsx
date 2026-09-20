import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { Check, Clock3, Heart, Navigation, Play } from 'lucide-react-native';
import { ScreenContainer } from '../components/ScreenContainer';
import { ScreenHeader } from '../components/ScreenHeader';
import { AccessibleText } from '../components/AccessibleText';
import { AccessibleButton } from '../components/AccessibleButton';
import { InlineMessage } from '../components/InlineMessage';
import { Icon } from '../components/Icon';
import { RouteMap } from '../components/RouteMap';
import { useAccessibility } from '../contexts/AccessibilityContext';
import { useFavorites } from '../hooks/useFavorites';
import { useLineDetail } from '../hooks/useLineDetail';
import { useStatusBarStyle } from '../hooks/useStatusBarStyle';
import { AppStackParamList } from '../navigation/types';
import { addMinutes } from '../utils/format';

type Props = NativeStackScreenProps<AppStackParamList, 'RouteDetail'>;

/**
 * Detalhes da linha (mockup 06): cabeçalho com a linha, mapa esquemático e
 * lista de paradas com embarque, destino e paradas já passadas. Os horários
 * das paradas só aparecem como horário do relógio quando a fonte de dados
 * traz o próximo horário; caso contrário mostram os minutos desde o início.
 */
export function RouteDetailScreen({ route, navigation }: Props) {
  const { t } = useTranslation();
  const { theme, settings } = useAccessibility();
  const p = route.params;
  const { line, isLoading, errorMessage } = useLineDetail(p.lineId);
  const { favoriteLines, addFavoriteLine, removeFavoriteLine } = useFavorites();
  useStatusBarStyle('light');
  const c = theme.colors;

  const isFavoriteLine = favoriteLines.some((item) => item.lineId === p.lineId);
  const stops = line?.stops ?? [];
  const boardingIndex = stops.findIndex((s) => s.stop.id === p.boardingStopId);
  const destinationIndex = stops.findIndex((s) => s.stop.id === p.alightingStopId);
  const hasTrip = boardingIndex >= 0 && destinationIndex > boardingIndex;
  const boardingMinutes = boardingIndex >= 0 ? stops[boardingIndex].minutesFromStart : 0;

  const subtitleParts = [
    t('routeDetail.summary', { stops: p.stopsCount ?? Math.max(stops.length - 1, 0), minutes: p.durationMinutes ?? '-' }),
  ];
  if (p.nextDeparture) subtitleParts.push(t('routeDetail.next', { time: p.nextDeparture }));

  function toggleFavoriteLine() {
    if (isFavoriteLine) removeFavoriteLine(p.lineId);
    else addFavoriteLine({ lineId: p.lineId, code: p.lineCode, name: p.lineName });
  }

  function startTrip() {
    if (!hasTrip) return;
    navigation.navigate('Tracking', {
      ...p,
      boardingStopId: p.boardingStopId as string,
      alightingStopId: p.alightingStopId as string,
    });
  }

  function timeLabel(minutesFromStart: number): string {
    if (p.nextDeparture) return addMinutes(p.nextDeparture, minutesFromStart - boardingMinutes);
    return t('routes.durationValue', { count: minutesFromStart });
  }

  const visibleStops = stops
    .map((s, index) => ({ s, index }))
    .filter(({ index }) => !settings.simpleMode || !hasTrip || (index >= boardingIndex && index <= destinationIndex));

  return (
    <ScreenContainer
      scroll
      padding={0}
      header={
        <ScreenHeader
          title={p.lineName}
          subtitle={subtitleParts.join(' · ')}
          onBack={() => navigation.goBack()}
          leading={
            <View style={[styles.codeBadge, { backgroundColor: c.headerOverlay }]} accessible={false} importantForAccessibility="no-hide-descendants">
              <AccessibleText variant="subtitle" weight="extrabold" color={c.onPrimary}>
                {p.lineCode}
              </AccessibleText>
            </View>
          }
        />
      }
      footer={
        line ? (
          <View style={[styles.footer, { backgroundColor: c.background, borderTopColor: c.border }]}>
            {hasTrip ? (
              <>
                <Pressable
                  onPress={toggleFavoriteLine}
                  accessibilityRole="button"
                  accessibilityLabel={isFavoriteLine ? t('routeDetail.unfavoriteLine') : t('routeDetail.favoriteLine')}
                  accessibilityState={{ selected: isFavoriteLine }}
                  style={[styles.heart, { borderColor: isFavoriteLine ? c.error : c.borderStrong, backgroundColor: c.surface }]}
                >
                  <Icon icon={Heart} size={24} color={isFavoriteLine ? c.error : c.textSecondary} fill={isFavoriteLine ? c.error : 'none'} />
                </Pressable>
                <View style={styles.flex}>
                  <AccessibleButton label={t('routeDetail.startTrip')} icon={Play} variant="success" size="lg" onPress={startTrip} />
                </View>
              </>
            ) : (
              <View style={styles.flex}>
                <AccessibleButton
                  label={isFavoriteLine ? t('routeDetail.unfavoriteLine') : t('routeDetail.favoriteLine')}
                  icon={Heart}
                  variant={isFavoriteLine ? 'secondary' : 'primary'}
                  onPress={toggleFavoriteLine}
                />
              </View>
            )}
          </View>
        ) : undefined
      }
    >
      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={c.primary} />
        </View>
      ) : null}
      {errorMessage ? (
        <View style={styles.pad}>
          <InlineMessage message={errorMessage} tone="error" />
        </View>
      ) : null}

      {!isLoading && stops.length > 1 && !settings.simpleMode ? (
        <RouteMap
          stops={stops.map((s) => s.stop)}
          lineCode={p.lineCode}
          boardingIndex={hasTrip ? boardingIndex : undefined}
          destinationIndex={hasTrip ? destinationIndex : stops.length - 1}
          height={170}
          accessibilityLabel={t('routeDetail.mapLabel', { code: p.lineCode })}
        />
      ) : null}

      {!isLoading && stops.length > 0 ? (
        <View style={styles.pad}>
          <View style={styles.listHeader}>
            <AccessibleText variant="subtitle" weight="extrabold" accessibilityRole="header">
              {t('routeDetail.stopsTitle')}
            </AccessibleText>
            <View style={styles.legend}>
              <View style={[styles.legendChip, { backgroundColor: c.primarySoft }]}>
                <AccessibleText variant="caption" weight="bold" color={c.primary}>
                  {t('routeDetail.legendBoarding')}
                </AccessibleText>
              </View>
              <View style={[styles.legendChip, { backgroundColor: c.successSoft }]}>
                <AccessibleText variant="caption" weight="bold" color={c.success}>
                  {t('routeDetail.legendDestination')}
                </AccessibleText>
              </View>
            </View>
          </View>

          {visibleStops.map(({ s, index }) => {
            const isBoarding = hasTrip && index === boardingIndex;
            const isDestination = hasTrip ? index === destinationIndex : index === stops.length - 1;
            const isPast = hasTrip && index < boardingIndex;
            const accent = isBoarding ? c.primary : isDestination ? c.success : c.border;
            const marker = isBoarding ? t('routeDetail.yourBoarding') : isDestination ? t('routeDetail.yourDestination') : null;

            return (
              <View
                key={s.stop.id + index}
                accessible
                accessibilityLabel={`${t('routeDetail.stopAccessibility', { name: s.stop.name, index: index + 1, total: stops.length })}${
                  marker ? `. ${marker}` : ''
                }. ${timeLabel(s.minutesFromStart)}`}
                style={[
                  styles.stopRow,
                  {
                    backgroundColor: isBoarding ? c.primarySoft : isDestination ? c.successBg : c.surface,
                    borderColor: accent,
                    borderWidth: isBoarding || isDestination ? 2 : 1,
                    opacity: isPast ? 0.6 : 1,
                  },
                ]}
              >
                <View style={[styles.stopIcon, { backgroundColor: c.surfaceAlt }]}>
                  <Icon
                    icon={isPast ? Check : isBoarding ? Navigation : Clock3}
                    size={18}
                    color={isBoarding ? c.primary : isDestination ? c.success : c.textSecondary}
                  />
                </View>
                <View style={styles.flex}>
                  <AccessibleText variant="body" weight="extrabold" style={isPast ? styles.strike : undefined}>
                    {s.stop.name}
                  </AccessibleText>
                  {marker ? (
                    <AccessibleText variant="label" color={isBoarding ? c.primary : c.success} style={styles.marker}>
                      {marker}
                    </AccessibleText>
                  ) : null}
                </View>
                <AccessibleText variant="body" weight="extrabold" color={c.textSecondary}>
                  {timeLabel(s.minutesFromStart)}
                </AccessibleText>
              </View>
            );
          })}
        </View>
      ) : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pad: { padding: 20 },
  loading: { padding: 40, alignItems: 'center' },
  codeBadge: {
    minWidth: 52,
    height: 46,
    borderRadius: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heart: {
    width: 60,
    height: 60,
    borderRadius: 16,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    flexWrap: 'wrap',
    gap: 8,
  },
  legend: { flexDirection: 'row', gap: 8 },
  legendChip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  stopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
  },
  stopIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  marker: { letterSpacing: 0.5, marginTop: 2 },
  strike: { textDecorationLine: 'line-through' },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderTopWidth: 1 },
});
