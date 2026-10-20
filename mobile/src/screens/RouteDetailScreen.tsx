import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useIsFocused } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Check, Clock3, Download, Heart, Navigation, Play } from 'lucide-react-native';
import { ScreenContainer } from '../components/ScreenContainer';
import { ScreenHeader } from '../components/ScreenHeader';
import { AccessibleText } from '../components/AccessibleText';
import { AccessibleButton } from '../components/AccessibleButton';
import { InlineMessage } from '../components/InlineMessage';
import { Card } from '../components/Card';
import { Icon } from '../components/Icon';
import { RouteMap } from '../components/RouteMap';
import { RouteBottomSheet } from '../components/RouteBottomSheet';
import { RouteOptionCard } from '../components/RouteOptionCard';
import { useAccessibility } from '../contexts/AccessibilityContext';
import { useFavorites } from '../hooks/useFavorites';
import { useLineDetail } from '../hooks/useLineDetail';
import { useNearbyPois } from '../hooks/useNearbyPois';
import { useStatusBarStyle } from '../hooks/useStatusBarStyle';
import { AppStackParamList } from '../navigation/types';
import { addMinutes } from '../utils/format';
import { routesService } from '../services/api/routesService';
import { RouteOption, ServiceAlertItem } from '../types/routes';

type Props = NativeStackScreenProps<AppStackParamList, 'RouteDetail'>;

export function RouteDetailScreen({ route, navigation }: Props) {
  const { t } = useTranslation();
  const { theme, settings, announce } = useAccessibility();
  const p = route.params;

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
  const { favoriteLines, favorites, addFavoriteLine, removeFavoriteLine } = useFavorites();
  const [serviceAlerts, setServiceAlerts] = useState<ServiceAlertItem[]>([]);
  const [alternatives, setAlternatives] = useState<RouteOption[]>([]);
  const [alternativesLoading, setAlternativesLoading] = useState(false);
  const [offlineSaved, setOfflineSaved] = useState(false);

  useStatusBarStyle('light');

  const c = theme.colors;
  const isFocused = useIsFocused();

  useEffect(() => {
    // Opções calculadas pela Google usam IDs virtuais e não possuem alerta
    // operacional local. Evita uma requisição que nunca acrescentaria dados.
    if (p.lineId.startsWith('google:')) {
      setServiceAlerts([]);
      return;
    }

    let cancelled = false;

    routesService.getServiceAlerts(p.lineId)
      .then((result) => {
        if (!cancelled) setServiceAlerts(result.available ? result.alerts : []);
      })
      .catch(() => {
        if (!cancelled) setServiceAlerts([]);
      });

    return () => {
      cancelled = true;
    };
  }, [p.lineId]);

  const hasServiceIssue = serviceAlerts.some((alert) =>
    alert.affectedLineIds.includes(p.lineId)
  );

  useEffect(() => {
    if (
      !hasServiceIssue ||
      p.originLatitude == null ||
      p.originLongitude == null ||
      p.destinationLatitude == null ||
      p.destinationLongitude == null
    ) {
      setAlternatives([]);
      return;
    }

    let cancelled = false;

    setAlternativesLoading(true);

    routesService.searchRoutes(
      { latitude: p.originLatitude, longitude: p.originLongitude },
      { latitude: p.destinationLatitude, longitude: p.destinationLongitude },
    )
      .then((items) => {
        if (!cancelled) {
          setAlternatives(
            items
              .filter((item) => item.lineId !== p.lineId)
              .slice(0, 3),
          );
        }
      })
      .catch(() => {
        if (!cancelled) setAlternatives([]);
      })
      .finally(() => {
        if (!cancelled) setAlternativesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    hasServiceIssue,
    p.lineId,
    p.originLatitude,
    p.originLongitude,
    p.destinationLatitude,
    p.destinationLongitude,
  ]);

  const isFavoriteLine = favoriteLines.some((item) =>
    item.lineId === p.lineId ||
    (
      item.code.trim().toLocaleLowerCase() === p.lineCode.trim().toLocaleLowerCase() &&
      item.name.trim().toLocaleLowerCase() === p.lineName.trim().toLocaleLowerCase()
    )
  );

  const stops = line?.stops ?? [];

  const boardingIndex = stops.findIndex(
    (s) => s.stop.id === p.boardingStopId,
  );

  // Uma linha circular pode passar duas vezes pelo mesmo ponto
  // (por exemplo, Terminal Central no início e no retorno).
  // O destino deve ser procurado depois do embarque,
  // e não simplesmente pelo primeiro ID encontrado.
  const destinationIndex = boardingIndex >= 0
    ? stops.findIndex(
        (s, index) =>
          index > boardingIndex &&
          s.stop.id === p.alightingStopId,
      )
    : -1;

  const hasTrip =
    boardingIndex >= 0 &&
    destinationIndex > boardingIndex;

  const boardingMinutes =
    boardingIndex >= 0
      ? stops[boardingIndex].minutesFromStart
      : 0;

  const orientationCenter = hasTrip
    ? stops[boardingIndex]?.stop
    : stops[0]?.stop;

  // Antes da viagem, o mapa usa o ponto de embarque como referência
  // inicial para os pontos de orientação.
  // Durante a viagem, TrackingScreen substitui essa referência pela
  // localização simulada/GPS e atualiza os POIs dinamicamente.
  const nearbyRoutePois = useNearbyPois(
    orientationCenter,
    isFocused,
  );

  const routePois = useMemo(() => {
    if (!orientationCenter) return [];

    return nearbyRoutePois.filter((poi) => {
      const lat1 = orientationCenter.latitude * Math.PI / 180;
      const lat2 = poi.latitude * Math.PI / 180;
      const dLat =
        (poi.latitude - orientationCenter.latitude) * Math.PI / 180;
      const dLon =
        (poi.longitude - orientationCenter.longitude) * Math.PI / 180;

      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1) *
          Math.cos(lat2) *
          Math.sin(dLon / 2) ** 2;

      const distance =
        6371000 *
        2 *
        Math.atan2(
          Math.sqrt(a),
          Math.sqrt(1 - a),
        );

      return distance <= 1000;
    });
  }, [nearbyRoutePois, orientationCenter]);

  const subtitleParts = [
    t('routeDetail.summary', {
      stops:
        p.stopsCount ??
        Math.max(stops.length - 1, 0),
      minutes: p.durationMinutes ?? '-',
    }),
  ];

  if (p.nextDeparture) {
    subtitleParts.push(
      t('routeDetail.next', {
        time: p.nextDeparture,
      }),
    );
  }

  function toggleFavoriteLine() {
    if (isFavoriteLine) {
      void removeFavoriteLine({
        lineId: p.lineId,
        code: p.lineCode,
        name: p.lineName,
      });
    } else {
      void addFavoriteLine({
        lineId: p.lineId,
        code: p.lineCode,
        name: p.lineName,
      });
    }
  }

  async function saveOfflineRegion() {
    if (
      p.originLatitude == null ||
      p.originLongitude == null ||
      p.destinationLatitude == null ||
      p.destinationLongitude == null
    ) {
      return;
    }

    const option: RouteOption = {
      lineId: p.lineId,
      lineCode: p.lineCode,
      lineName: p.lineName,

      boardingStop: {
        id: p.boardingStopId ?? '',
        name: stops[boardingIndex]?.stop.name ?? '',
        distanceMeters: 0,
        latitude: stops[boardingIndex]?.stop.latitude,
        longitude: stops[boardingIndex]?.stop.longitude,
      },

      alightingStop: {
        id: p.alightingStopId ?? '',
        name: stops[destinationIndex]?.stop.name ?? '',
        distanceMeters: 0,
        latitude: stops[destinationIndex]?.stop.latitude,
        longitude: stops[destinationIndex]?.stop.longitude,
      },

      stopsCount:
        p.stopsCount ??
        Math.max(stops.length - 1, 0),

      durationMinutes:
        p.durationMinutes ?? 0,

      nextDeparture: p.nextDeparture,

      shape: line?.shape ?? p.shape,

      stops: line?.stops ?? p.stops,
    };

    await routesService.saveOfflineRoute(
      {
        label: '',
        latitude: p.originLatitude,
        longitude: p.originLongitude,
      },
      {
        label: p.destinationLabel ?? '',
        latitude: p.destinationLatitude,
        longitude: p.destinationLongitude,
      },
      [option],
    );

    setOfflineSaved(true);

    announce(
      t('routeDetail.offlineSaved'),
      { haptic: 'success' },
    );
  }

  function startTrip() {
    if (!hasTrip) return;

    navigation.navigate('Tracking', {
      ...p,
      boardingStopId: p.boardingStopId as string,
      alightingStopId: p.alightingStopId as string,
      shape: p.shape,
    });
  }

  function timeLabel(minutesFromStart: number): string {
    if (p.nextDeparture) {
      return addMinutes(
        p.nextDeparture,
        minutesFromStart - boardingMinutes,
      );
    }

    return t('routes.durationValue', {
      count: minutesFromStart,
    });
  }

  const visibleStops = stops
    .map((s, index) => ({ s, index }))
    .filter(
      ({ index }) =>
        !settings.simpleMode ||
        !hasTrip ||
        (index >= boardingIndex &&
          index <= destinationIndex),
    );

  const stopsScrollRef = useRef<ScrollView>(null);

  // Mantemos somente a altura do conteúdo disponível para limitar
  // o Bottom Sheet. A altura do mapa NÃO é calculada manualmente.
  const [routeContentHeight, setRouteContentHeight] = useState(0);
  const COLLAPSED_SHEET_HEIGHT = 74;

  return (
    <ScreenContainer
      padding={0}
      header={
        <ScreenHeader
          title={p.lineName}
          subtitle={subtitleParts.join(' · ')}
          onBack={() => navigation.goBack()}
          leading={
            <View
              style={[
                styles.codeBadge,
                {
                  backgroundColor: c.headerOverlay,
                },
              ]}
              accessible={false}
              importantForAccessibility="no-hide-descendants"
            >
              <AccessibleText
                variant="subtitle"
                weight="extrabold"
                color={c.onPrimary}
              >
                {p.lineCode}
              </AccessibleText>
            </View>
          }
        />
      }
      footer={
        line ? (
          <View
            style={[
              styles.footer,
              {
                backgroundColor: c.background,
                borderTopColor: c.border,
              },
            ]}
          >
            {hasTrip ? (
              <>
                <Pressable
                  onPress={toggleFavoriteLine}
                  accessibilityRole="button"
                  accessibilityLabel={
                    isFavoriteLine
                      ? t('routeDetail.unfavoriteLine')
                      : t('routeDetail.favoriteLine')
                  }
                  accessibilityState={{
                    selected: isFavoriteLine,
                  }}
                  style={[
                    styles.heart,
                    {
                      borderColor: isFavoriteLine
                        ? c.error
                        : c.borderStrong,
                      backgroundColor: c.surface,
                    },
                  ]}
                >
                  <Icon
                    icon={Heart}
                    size={24}
                    color={
                      isFavoriteLine
                        ? c.error
                        : c.textSecondary
                    }
                    fill={
                      isFavoriteLine
                        ? c.error
                        : 'none'
                    }
                  />
                </Pressable>

                <View style={styles.flex}>
                  <AccessibleButton
                    label={t('routeDetail.startTrip')}
                    icon={Play}
                    variant="success"
                    size="lg"
                    onPress={startTrip}
                  />
                </View>
              </>
            ) : (
              <View style={styles.flex}>
                <AccessibleButton
                  label={
                    isFavoriteLine
                      ? t('routeDetail.unfavoriteLine')
                      : t('routeDetail.favoriteLine')
                  }
                  icon={Heart}
                  variant={
                    isFavoriteLine
                      ? 'secondary'
                      : 'primary'
                  }
                  onPress={toggleFavoriteLine}
                />
              </View>
            )}
          </View>
        ) : undefined
      }
    >
      <View
        style={styles.root}
        onLayout={(event) => {
          const nextHeight =
            event.nativeEvent.layout.height;

          if (nextHeight !== routeContentHeight) {
            setRouteContentHeight(nextHeight);
          }
        }}
      >
        {isLoading ? (
          <View style={styles.loading}>
            <ActivityIndicator
              size="large"
              color={c.primary}
            />
          </View>
        ) : null}

        {errorMessage ? (
          <View style={styles.error}>
            <InlineMessage
              message={errorMessage}
              tone="error"
            />
          </View>
        ) : null}

        {hasServiceIssue ? (
          <View style={styles.noticeWrap}>
            <Card
              backgroundColor={c.surfaceAlt}
              borderColor={c.warning}
              style={styles.noticeCard}
              accessible
              accessibilityLiveRegion="polite"
            >
              <View style={styles.noticeHeader}>
                <Icon
                  icon={AlertTriangle}
                  size={20}
                  color={c.warning}
                />

                <AccessibleText
                  variant="body"
                  weight="extrabold"
                  color={c.warning}
                >
                  {t('routes.serviceIssueTitle')}
                </AccessibleText>
              </View>

              <AccessibleText
                variant="caption"
                color={c.textSecondary}
              >
                {t('routes.serviceIssueBody')}
              </AccessibleText>
            </Card>

            <AccessibleText
              variant="subtitle"
              weight="extrabold"
              style={styles.alternativesTitle}
            >
              {t('routes.alternativesTitle')}
            </AccessibleText>

            {alternativesLoading ? (
              <ActivityIndicator
                size="small"
                color={c.primary}
              />
            ) : null}

            {!alternativesLoading &&
            alternatives.length === 0 ? (
              <InlineMessage
                message={t('routes.noAlternatives')}
                tone="warning"
              />
            ) : null}

            {!alternativesLoading
              ? alternatives.map((option) => (
                  <RouteOptionCard
                    key={`alt-${option.lineId}-${option.boardingStop.id}-${option.alightingStop.id}`}
                    option={option}
                    fastest={false}
                    onOpen={() =>
                      navigation.replace(
                        'RouteDetail',
                        {
                          lineId: option.lineId,
                          lineCode: option.lineCode,
                          lineName: option.lineName,
                          boardingStopId:
                            option.boardingStop.id,
                          alightingStopId:
                            option.alightingStop.id,
                          durationMinutes:
                            option.durationMinutes,
                          stopsCount:
                            option.stopsCount,
                          nextDeparture:
                            option.nextDeparture,
                          destinationLabel:
                            p.destinationLabel,
                          originLatitude:
                            p.originLatitude,
                          originLongitude:
                            p.originLongitude,
                          destinationLatitude:
                            p.destinationLatitude,
                          destinationLongitude:
                            p.destinationLongitude,
                        },
                      )
                    }
                  />
                ))
              : null}
          </View>
        ) : null}

        {!isLoading && stops.length > 0 ? (
          <View
            style={[
              styles.routeVisualArea,
              { paddingBottom: COLLAPSED_SHEET_HEIGHT },
            ]}
          >
            {p.originLatitude != null &&
            p.originLongitude != null &&
            p.destinationLatitude != null &&
            p.destinationLongitude != null ? (
              <AccessibleButton
                label={
                  offlineSaved
                    ? t('routeDetail.offlineSavedButton')
                    : t('routeDetail.saveOffline')
                }
                icon={Download}
                variant="secondary"
                onPress={() => {
                  void saveOfflineRegion();
                }}
                style={styles.offlineButton}
              />
            ) : null}

            <View style={styles.mapArea}>
              <RouteMap
                stops={
                  hasTrip
                    ? [
                        stops[boardingIndex].stop,
                        stops[destinationIndex].stop,
                      ]
                    : [
                        stops[0].stop,
                        stops[stops.length - 1].stop,
                      ]
                }
                shape={line?.shape ?? p.shape}
                lineCode={p.lineCode}
                boardingIndex={0}
                destinationIndex={1}
                pois={routePois}
                favorites={favorites}
                accessibilityLabel={t(
                  'routeDetail.mapLabel',
                  { code: p.lineCode },
                )}
              />
            </View>
          </View>
        ) : null}

        {!isLoading && stops.length > 0 ? (
          <RouteBottomSheet
            title={t('routeDetail.stopsTitle')}
            initialHeight={230}
            collapsedHeight={COLLAPSED_SHEET_HEIGHT}
            maxHeight={
              routeContentHeight > 0
                ? Math.max(
                    74,
                    Math.min(
                      routeContentHeight * 0.72,
                      routeContentHeight - 8,
                    ),
                  )
                : undefined
            }
            onExpandedChange={(isExpanded) => {
              if (isExpanded) {
                requestAnimationFrame(() => {
                  stopsScrollRef.current?.scrollTo({
                    y: 0,
                    animated: false,
                  });
                });
              }
            }}
          >
            <ScrollView
              ref={stopsScrollRef}
              style={styles.sheetScroll}
              showsVerticalScrollIndicator
              persistentScrollbar
              contentContainerStyle={styles.sheetContent}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
              bounces={false}
              alwaysBounceVertical={false}
              contentInsetAdjustmentBehavior="never"
              scrollIndicatorInsets={{
                top: 0,
                bottom: 0,
              }}
            >
              <View style={styles.listHeader}>
                <AccessibleText
                  variant="label"
                  weight="bold"
                  color={c.textSecondary}
                >
                  {t('routeDetail.stopsTitle')}
                </AccessibleText>

                <View style={styles.legend}>
                  <View
                    style={[
                      styles.legendChip,
                      {
                        backgroundColor:
                          c.primarySoft,
                      },
                    ]}
                  >
                    <AccessibleText
                      variant="caption"
                      weight="bold"
                      color={c.primary}
                    >
                      {t(
                        'routeDetail.legendBoarding',
                      )}
                    </AccessibleText>
                  </View>

                  <View
                    style={[
                      styles.legendChip,
                      {
                        backgroundColor:
                          c.successSoft,
                      },
                    ]}
                  >
                    <AccessibleText
                      variant="caption"
                      weight="bold"
                      color={c.success}
                    >
                      {t(
                        'routeDetail.legendDestination',
                      )}
                    </AccessibleText>
                  </View>
                </View>
              </View>

              {visibleStops.map(({ s, index }) => {
                const isBoarding =
                  hasTrip &&
                  index === boardingIndex;

                const isDestination = hasTrip
                  ? index === destinationIndex
                  : index === stops.length - 1;

                const isPast =
                  hasTrip &&
                  index < boardingIndex;

                const accent = isBoarding
                  ? c.primary
                  : isDestination
                    ? c.success
                    : c.border;

                const marker = isBoarding
                  ? t('routeDetail.yourBoarding')
                  : isDestination
                    ? t(
                        'routeDetail.yourDestination',
                      )
                    : null;

                return (
                  <View
                    key={s.stop.id + index}
                    accessible
                    accessibilityLabel={`${t(
                      'routeDetail.stopAccessibility',
                      {
                        name: s.stop.name,
                        index: index + 1,
                        total: stops.length,
                      },
                    )}${marker ? `. ${marker}` : ''}. ${timeLabel(
                      s.minutesFromStart,
                    )}`}
                    style={[
                      styles.stopRow,
                      {
                        backgroundColor: isBoarding
                          ? c.primarySoft
                          : isDestination
                            ? c.successBg
                            : c.surface,
                        borderColor: accent,
                        borderWidth:
                          isBoarding ||
                          isDestination
                            ? 2
                            : 1,
                        opacity: isPast
                          ? 0.6
                          : 1,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.stopIcon,
                        {
                          backgroundColor:
                            c.surfaceAlt,
                        },
                      ]}
                    >
                      <Icon
                        icon={
                          isPast
                            ? Check
                            : isBoarding
                              ? Navigation
                              : Clock3
                        }
                        size={18}
                        color={
                          isBoarding
                            ? c.primary
                            : isDestination
                              ? c.success
                              : c.textSecondary
                        }
                      />
                    </View>

                    <View style={styles.flex}>
                      <AccessibleText
                        variant="body"
                        weight="extrabold"
                        style={
                          isPast
                            ? styles.strike
                            : undefined
                        }
                      >
                        {s.stop.name}
                      </AccessibleText>

                      <AccessibleText
                        variant="caption"
                        color={c.textSecondary}
                      >
                        {t(
                          'routeDetail.stopDescription',
                          {
                            name: s.stop.name,
                          },
                        )}
                      </AccessibleText>

                      {marker ? (
                        <AccessibleText
                          variant="label"
                          color={
                            isBoarding
                              ? c.primary
                              : c.success
                          }
                          style={styles.marker}
                        >
                          {marker}
                        </AccessibleText>
                      ) : null}
                    </View>

                    <AccessibleText
                      variant="body"
                      weight="extrabold"
                      color={c.textSecondary}
                    >
                      {timeLabel(
                        s.minutesFromStart,
                      )}
                    </AccessibleText>
                  </View>
                );
              })}
            </ScrollView>
          </RouteBottomSheet>
        ) : null}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    position: 'relative',
    minHeight: 0,
  },

  /*
   * Este container é o ponto principal da correção.
   * Ele ocupa todo o espaço restante entre o conteúdo
   * superior e o footer da ScreenContainer.
   */
  routeVisualArea: {
    flex: 1,
    minHeight: 0,
    width: '100%',
  },

  /*
   * O mapa agora recebe diretamente todo o espaço
   * disponível dentro de routeVisualArea.
   * Não usamos mais uma altura medida manualmente.
   */
  mapArea: {
    flex: 1,
    minHeight: 0,
    width: '100%',
  },

  flex: {
    flex: 1,
  },

  error: {
    padding: 12,
  },

  noticeWrap: {
    paddingHorizontal: 12,
    paddingTop: 8,
    gap: 10,
  },

  noticeCard: {
    padding: 14,
    borderWidth: 2,
    gap: 8,
  },

  noticeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  alternativesTitle: {
    marginTop: 4,
  },

  loading: {
    padding: 30,
    alignItems: 'center',
  },

  offlineButton: {
    marginHorizontal: 20,
    marginTop: 14,
    marginBottom: 14,
  },

  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderTopWidth: 1,
    position: 'relative',
    zIndex: 20,
    elevation: 20,
  },

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

  sheetScroll: {
    flex: 1,
    minHeight: 0,
  },

  sheetContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    gap: 10,
    paddingBottom: 24,
  },

  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 4,
  },

  legend: {
    flexDirection: 'row',
    gap: 6,
  },

  legendChip: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
  },

  stopRow: {
    minHeight: 64,
    borderRadius: 12,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  stopIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },

  marker: {
    marginTop: 3,
  },

  strike: {
    textDecorationLine: 'line-through',
  },
});
