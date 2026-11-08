import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useIsFocused } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Bell, BellRing, Check, Clock3, Download, Heart, Navigation, Play, Trash2 } from 'lucide-react-native';
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
import { useNotifications } from '../contexts/NotificationsContext';
import { useFavorites } from '../hooks/useFavorites';
import { useLineDetail } from '../hooks/useLineDetail';
import { useNearbyPois } from '../hooks/useNearbyPois';
import { useStatusBarStyle } from '../hooks/useStatusBarStyle';
import { useConnectivity } from '../hooks/useConnectivity';
import { AppStackParamList } from '../navigation/types';
import { addMinutes } from '../utils/format';
import { routesService } from '../services/api/routesService';
import { routeCacheRepository } from '../database/repositories/routeCacheRepository';
import { offlineMapService } from '../services/storage/offlineMapService';
import { connectivityService } from '../services/connectivity/connectivityService';
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
  const { isFollowing, follow, unfollow } = useNotifications();
  const [serviceAlerts, setServiceAlerts] = useState<ServiceAlertItem[]>([]);
  const [alternatives, setAlternatives] = useState<RouteOption[]>([]);
  const [alternativesLoading, setAlternativesLoading] = useState(false);
  const [offlineSaved, setOfflineSaved] = useState(Boolean(p.offlineSaved));
  const [offlineSaving, setOfflineSaving] = useState(false);

  useStatusBarStyle('light');

  const c = theme.colors;
  const isFocused = useIsFocused();
  const { isConnected } = useConnectivity(false);

  useEffect(() => {
    let cancelled = false;

    if (
      p.originLatitude == null ||
      p.originLongitude == null ||
      p.destinationLatitude == null ||
      p.destinationLongitude == null ||
      !p.boardingStopId ||
      !p.alightingStopId
    ) {
      setOfflineSaved(Boolean(p.offlineSaved));
      return () => {
        cancelled = true;
      };
    }

    void routeCacheRepository.hasLine(p.lineId)
      .then((savedRoute) => {
        if (!cancelled) setOfflineSaved(savedRoute);
      })
      .catch(() => {
        if (!cancelled) setOfflineSaved(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    p.originLatitude,
    p.originLongitude,
    p.destinationLatitude,
    p.destinationLongitude,
    p.boardingStopId,
    p.alightingStopId,
    p.lineId,
    p.offlineSaved,
  ]);

  useEffect(() => {
    // Opções calculadas pela Google usam IDs virtuais e não possuem alerta
    // operacional local. Evita uma requisição que nunca acrescentaria dados.
    if (p.lineId.startsWith('google:')) {
      setServiceAlerts([]);
      return;
    }

    const origin = { latitude: p.originLatitude, longitude: p.originLongitude };
    const destination = { latitude: p.destinationLatitude, longitude: p.destinationLongitude };
    let cancelled = false;

    void connectivityService.isConnected().then((online) => {
      if (!online || cancelled) return;
      return routesService.getServiceAlerts(p.lineId)
        .then((result) => {
          if (!cancelled) setServiceAlerts(result.available ? result.alerts : []);
        })
        .catch(() => {
          if (!cancelled) setServiceAlerts([]);
        });
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

    void connectivityService.isConnected().then((online) => {
      if (!online || cancelled) {
        if (!cancelled) setAlternatives([]);
        return;
      }

      setAlternativesLoading(true);

      // Os parâmetros foram validados acima, mas o TypeScript não mantém esse
      // narrowing dentro do callback assíncrono. Capturamos os valores locais
      // e validamos novamente antes de montar Coordinates.
      const originLatitude = p.originLatitude;
      const originLongitude = p.originLongitude;
      const destinationLatitude = p.destinationLatitude;
      const destinationLongitude = p.destinationLongitude;

      if (
        originLatitude == null ||
        originLongitude == null ||
        destinationLatitude == null ||
        destinationLongitude == null
      ) {
        setAlternativesLoading(false);
        return;
      }

      const origin = {
        latitude: originLatitude,
        longitude: originLongitude,
      };
      const destination = {
        latitude: destinationLatitude,
        longitude: destinationLongitude,
      };

      return routesService.searchRoutes(origin, destination)
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
    isFocused && isConnected,
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

  // US17: acompanhar avisos (alteração, desvio, interrupção) desta linha.
  // Linhas calculadas pela Google usam IDs virtuais e não têm avisos oficiais.
  const canFollowNotices = !p.lineId.startsWith('google:');
  const isFollowingNotices = isFollowing(p.lineId);

  async function toggleFollowNotices() {
    if (isFollowingNotices) {
      await unfollow(p.lineId);
      announce(t('notifications.unfollowedAnnounce', { code: p.lineCode }), { haptic: 'success' });
    } else {
      await follow({ lineId: p.lineId, code: p.lineCode, name: p.lineName });
      announce(t('notifications.followLineAnnounce', { code: p.lineCode }), { haptic: 'success' });
    }
  }

  const followButton = canFollowNotices ? (
    <Pressable
      onPress={() => void toggleFollowNotices()}
      accessibilityRole="button"
      accessibilityLabel={isFollowingNotices ? t('notifications.unfollowLine') : t('notifications.followLine')}
      accessibilityState={{ selected: isFollowingNotices }}
      style={[
        styles.heart,
        {
          borderColor: isFollowingNotices ? c.warning : c.borderStrong,
          backgroundColor: c.surface,
        },
      ]}
    >
      <Icon
        icon={isFollowingNotices ? BellRing : Bell}
        size={24}
        color={isFollowingNotices ? c.warning : c.textSecondary}
      />
    </Pressable>
  ) : null;

  async function saveOfflineRegion() {
    if (!isConnected || offlineSaved || offlineSaving) {
      return;
    }

    if (
      p.originLatitude == null ||
      p.originLongitude == null ||
      p.destinationLatitude == null ||
      p.destinationLongitude == null ||
      !p.boardingStopId ||
      !p.alightingStopId
    ) {
      return;
    }

    const option: RouteOption = {
      lineId: p.lineId,
      lineCode: p.lineCode,
      lineName: p.lineName,

      boardingStop: {
        id: p.boardingStopId,
        name: stops[boardingIndex]?.stop.name ?? '',
        distanceMeters: 0,
        latitude: stops[boardingIndex]?.stop.latitude,
        longitude: stops[boardingIndex]?.stop.longitude,
      },

      alightingStop: {
        id: p.alightingStopId,
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

    setOfflineSaving(true);

    try {
      // Primeiro persistimos a rota no SQLite. Esse é o dado principal e
      // sua confirmação não depende do download do mapa.
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

      // A rota já está persistida neste ponto. O botão pode voltar a responder
      // imediatamente; o download do mapa continua em segundo plano.
      setOfflineSaving(false);
      announce(
        t('routeDetail.offlineSaved'),
        { haptic: 'success' },
      );

      const regionKey = offlineMapService.makeRegionKey(
        p.originLatitude,
        p.originLongitude,
        p.destinationLatitude,
        p.destinationLongitude,
      );

      const mapPoints = [
        { latitude: p.originLatitude, longitude: p.originLongitude },
        { latitude: p.destinationLatitude, longitude: p.destinationLongitude },
        ...(option.shape ?? []),
        ...(option.stops ?? []).map((item) => item.stop),
      ];

      void offlineMapService.saveRegion(regionKey, mapPoints).catch(() => {
        // Falha do mapa não desfaz a rota persistida.
        announce(
          t('routeDetail.offlineMapSaveFailed'),
          { haptic: 'warning' },
        );
      });
    } catch (error) {
      // Não marcar a rota como salva quando o armazenamento não confirmou.
      setOfflineSaved(false);
      const message =
        error instanceof Error
          ? error.message
          : t('routeDetail.offlineSaveError');
      announce(message, { haptic: 'error' });
    } finally {
      setOfflineSaving(false);
    }
  }

  async function removeOfflineRoute() {
    setOfflineSaving(true);

    try {
      const removed = await routeCacheRepository.removeLine(p.lineId);

      setOfflineSaved(false);
      setOfflineSaving(false);
      announce(t('routeDetail.offlineRemoved'), { haptic: 'success' });

      // A rota pode ter sido salva a partir de outra origem/destino.
      // Limpa as regiões correspondentes ao registro realmente removido.
      for (const item of removed) {
        const regionKey = offlineMapService.makeRegionKey(
          item.originLatitude,
          item.originLongitude,
          item.destinationLatitude,
          item.destinationLongitude,
        );
        void offlineMapService.removeRegion(regionKey).catch(() => {
          // Falha na limpeza dos tiles não desfaz a remoção da rota salva.
        });
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : t('routeDetail.offlineRemoveError');
      announce(message, { haptic: 'error' });
    } finally {
      setOfflineSaving(false);
    }
  }

  function startTrip() {
    if (!hasTrip) return;

    navigation.navigate('Tracking', {
      ...p,
      boardingStopId: p.boardingStopId as string,
      alightingStopId: p.alightingStopId as string,
      shape: p.shape,
      offlineSaved,
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

  const stopsScrollRef = useRef<React.ElementRef<typeof ScrollView>>(null);

  // Mantemos somente a altura do conteúdo disponível para limitar
  // o Bottom Sheet. A altura do mapa NÃO é calculada manualmente.
  const [routeContentHeight, setRouteContentHeight] = useState(0);
  const COLLAPSED_SHEET_HEIGHT = 74;

  return (
    <ScreenContainer
      padding={0}
      header={
        <ScreenHeader
          compact
          titleVariant="subtitle"
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
                variant="label"
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

                {followButton}

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
              <>
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
              {followButton}
              </>
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
              <View style={styles.offlineControls}>
                <AccessibleButton
                  label={
                    offlineSaved
                      ? t('routeDetail.offlineSavedButton')
                      : t('routeDetail.saveOffline')
                  }
                  icon={offlineSaved ? Check : Download}
                  variant="secondary"
                  onPress={() => {
                    void saveOfflineRegion();
                  }}
                  loading={offlineSaving}
                  disabled={offlineSaved || !isConnected || offlineSaving}
                  style={styles.offlineButton}
                />
                {offlineSaved ? (
                  <Pressable
                    onPress={() => { void removeOfflineRoute(); }}
                    accessibilityRole="button"
                    accessibilityLabel={t('routeDetail.removeOffline')}
                    style={styles.removeOfflineButton}
                  >
                    <Icon icon={Trash2} size={16} color={c.error} />
                    <AccessibleText variant="caption" weight="bold" color={c.error}>
                      {t('routeDetail.removeOffline')}
                    </AccessibleText>
                  </Pressable>
                ) : null}
              </View>
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
                offlineRegionKey={
                  p.originLatitude != null &&
                  p.originLongitude != null &&
                  p.destinationLatitude != null &&
                  p.destinationLongitude != null
                    ? offlineMapService.makeRegionKey(
                        p.originLatitude,
                        p.originLongitude,
                        p.destinationLatitude,
                        p.destinationLongitude,
                      )
                    : null
                }
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

  offlineControls: {
    marginHorizontal: 12,
    marginTop: 6,
    marginBottom: 6,
    gap: 4,
  },

  offlineButton: {
    marginHorizontal: 8,
    marginTop: 2,
    marginBottom: 2,
    minHeight: 42,
  },

  removeOfflineButton: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
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
    minWidth: 46,
    height: 40,
    borderRadius: 10,
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
