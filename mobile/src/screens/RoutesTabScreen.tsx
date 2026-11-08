import React from 'react';
import { StyleSheet, View, ActivityIndicator, Pressable } from 'react-native';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { Download, Search, Trash2 } from 'lucide-react-native';
import { ScreenContainer } from '../components/ScreenContainer';
import { ScreenHeader } from '../components/ScreenHeader';
import { AccessibleText } from '../components/AccessibleText';
import { AccessibleButton } from '../components/AccessibleButton';
import { AccessibleTextInput } from '../components/AccessibleTextInput';
import { RouteBadge } from '../components/RouteBadge';
import { InlineMessage } from '../components/InlineMessage';
import { RouteOptionCard } from '../components/RouteOptionCard';
import { Icon } from '../components/Icon';
import { useAccessibility } from '../contexts/AccessibilityContext';
import { useSearchHistory } from '../hooks/useSearchHistory';
import { useRouteDraft } from '../contexts/RouteDraftContext';
import { useRouteOptions } from '../hooks/useRouteOptions';
import { routesService } from '../services/api/routesService';
import { routeCacheRepository, OfflineSavedRouteItem } from '../database/repositories/routeCacheRepository';
import { offlineMapService } from '../services/storage/offlineMapService';
import { LineSearchResult, RouteOption } from '../types/routes';
import { useStatusBarStyle } from '../hooks/useStatusBarStyle';
import { AppStackParamList } from '../navigation/types';

/**
 * Aba "Rotas": mostra a última busca e, separadamente, as rotas
 * efetivamente persistidas pelo usuário para uso offline.
 */
export function RoutesTabScreen() {
  const { t } = useTranslation();
  const { theme, announce } = useAccessibility();
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const isFocused = useIsFocused();
  const { lastRoute } = useSearchHistory();
  const draft = useRouteDraft();
  const hasCurrentRouteDraft = Boolean(draft.origin && draft.destination);
  const currentRoute = hasCurrentRouteDraft ? lastRoute : null;
  const origin = currentRoute
    ? { latitude: currentRoute.originLatitude, longitude: currentRoute.originLongitude }
    : null;
  const destination = currentRoute
    ? { latitude: currentRoute.destinationLatitude, longitude: currentRoute.destinationLongitude }
    : null;
  const { options, isLoading, errorMessage, hasTransitData } = useRouteOptions(origin, destination);
  const [lineQuery, setLineQuery] = React.useState('');
  const [lineResults, setLineResults] = React.useState<LineSearchResult[]>([]);
  const [lineLoading, setLineLoading] = React.useState(false);
  const [savedOfflineRoutes, setSavedOfflineRoutes] = React.useState<OfflineSavedRouteItem[]>([]);
  const [offlineExpanded, setOfflineExpanded] = React.useState(false);
  const [offlineLoading, setOfflineLoading] = React.useState(false);
  const [removingKey, setRemovingKey] = React.useState<string | null>(null);

  const refreshSavedOfflineRoutes = React.useCallback(async () => {
    setOfflineLoading(true);
    try {
      const items = await routeCacheRepository.listAll();
      setSavedOfflineRoutes(items);
    } catch (error) {
      setSavedOfflineRoutes([]);
      announce(
        error instanceof Error ? error.message : t('routes.savedOfflineLoadError'),
        { haptic: 'warning' },
      );
    } finally {
      setOfflineLoading(false);
    }
  }, [announce, t]);

  React.useEffect(() => {
    if (!isFocused) return;
    void refreshSavedOfflineRoutes();
  }, [isFocused, refreshSavedOfflineRoutes]);

  React.useEffect(() => {
    const query = lineQuery.trim();
    if (!query) {
      setLineResults([]);
      setLineLoading(false);
      return;
    }

    let cancelled = false;
    setLineLoading(true);

    const timer = setTimeout(() => {
      routesService.searchLines(query)
        .then((items) => {
          if (!cancelled) setLineResults(items);
        })
        .catch(() => {
          if (!cancelled) setLineResults([]);
        })
        .finally(() => {
          if (!cancelled) setLineLoading(false);
        });
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [lineQuery]);

  useStatusBarStyle('light');
  const c = theme.colors;

  function open(option: RouteOption) {
    navigation.navigate('RouteDetail', {
      lineId: option.lineId,
      lineCode: option.lineCode,
      lineName: option.lineName,
      boardingStopId: option.boardingStop.id,
      alightingStopId: option.alightingStop.id,
      durationMinutes: option.durationMinutes,
      stopsCount: option.stopsCount,
      nextDeparture: option.nextDeparture,
      destinationLabel: currentRoute?.destinationLabel,
      originLatitude: currentRoute?.originLatitude,
      originLongitude: currentRoute?.originLongitude,
      destinationLatitude: currentRoute?.destinationLatitude,
      destinationLongitude: currentRoute?.destinationLongitude,
      shape: option.shape,
      stops: option.stops,
      offlineSaved: Boolean(option.offlineCached),
    });
  }

  function openSavedOffline(item: OfflineSavedRouteItem) {
    navigation.navigate('RouteDetail', {
      lineId: item.option.lineId,
      lineCode: item.option.lineCode,
      lineName: item.option.lineName,
      boardingStopId: item.option.boardingStop.id,
      alightingStopId: item.option.alightingStop.id,
      durationMinutes: item.option.durationMinutes,
      stopsCount: item.option.stopsCount,
      nextDeparture: item.option.nextDeparture,
      destinationLabel: item.destinationLabel,
      originLatitude: item.originLatitude,
      originLongitude: item.originLongitude,
      destinationLatitude: item.destinationLatitude,
      destinationLongitude: item.destinationLongitude,
      shape: item.option.shape,
      stops: item.option.stops,
      offlineSaved: true,
    });
  }

  async function removeSavedOffline(item: OfflineSavedRouteItem) {
    const key = `${item.option.lineId}`;
    setRemovingKey(key);

    try {
      const removed = await routeCacheRepository.removeLine(item.option.lineId);

      setSavedOfflineRoutes((previous) =>
        previous.filter((current) => current.option.lineId !== item.option.lineId),
      );

      for (const removedItem of removed) {
        const regionKey = offlineMapService.makeRegionKey(
          removedItem.originLatitude,
          removedItem.originLongitude,
          removedItem.destinationLatitude,
          removedItem.destinationLongitude,
        );

        void offlineMapService.removeRegion(regionKey).catch(() => {
          // A rota já foi removida do armazenamento persistente.
        });
      }
    } catch (error) {
      announce(
        error instanceof Error ? error.message : t('routes.savedOfflineRemoveError'),
        { haptic: 'warning' },
      );
    } finally {
      setRemovingKey(null);
    }
  }

  return (
    <ScreenContainer
      scroll
      header={
        <ScreenHeader
          title={t('routes.tabTitle')}
          subtitle={
            currentRoute
              ? `${currentRoute.originLabel} → ${currentRoute.destinationLabel}`
              : t('routes.tabSubtitle')
          }
        />
      }
    >
      <View
        style={[
          styles.offlineSection,
          { borderColor: c.border, backgroundColor: c.surface },
        ]}
      >
        <Pressable
          onPress={() => setOfflineExpanded((value) => !value)}
          accessibilityRole="button"
          accessibilityState={{ expanded: offlineExpanded }}
          accessibilityLabel={t('routes.savedOfflineTitle')}
          style={styles.offlineHeader}
        >
          <View style={[styles.offlineIcon, { backgroundColor: c.primarySoft }]}>
            <Icon icon={Download} size={20} color={c.primary} />
          </View>

          <View style={styles.flex}>
            <AccessibleText variant="subtitle" weight="extrabold">
              {t('routes.savedOfflineTitle')}
            </AccessibleText>

            <AccessibleText variant="caption" color={c.textSecondary}>
              {savedOfflineRoutes.length === 1
                ? t('routes.savedOfflineCountOne')
                : t('routes.savedOfflineCountOther', {
                    count: savedOfflineRoutes.length,
                  })}
            </AccessibleText>
          </View>
        </Pressable>

        {offlineExpanded ? (
          <View style={styles.offlineList}>
            {offlineLoading ? (
              <ActivityIndicator size="small" color={c.primary} />
            ) : savedOfflineRoutes.length === 0 ? (
              <InlineMessage message={t('routes.savedOfflineEmpty')} tone="info" />
            ) : (
              savedOfflineRoutes.map((item) => {
                const key = `${item.cacheKey}:${item.option.lineId}:${item.option.boardingStop.id}:${item.option.alightingStop.id}`;

                return (
                  <View
                    key={key}
                    style={[
                      styles.savedRouteCard,
                      {
                        borderColor: c.border,
                        backgroundColor: c.surfaceAlt,
                      },
                    ]}
                  >
                    <Pressable
                      onPress={() => openSavedOffline(item)}
                      accessibilityRole="button"
                      accessibilityLabel={`${item.option.lineCode}, ${item.option.lineName}`}
                      style={styles.savedRouteMain}
                    >
                      <RouteBadge code={item.option.lineCode} />

                      <View style={styles.flex}>
                        <AccessibleText variant="body" weight="extrabold">
                          {item.option.lineName}
                        </AccessibleText>
                      </View>
                    </Pressable>

                    <Pressable
                      onPress={() => {
                        void removeSavedOffline(item);
                      }}
                      disabled={removingKey === key}
                      accessibilityRole="button"
                      accessibilityLabel={`${t('routes.savedOfflineRemove')}: ${item.option.lineName}`}
                      style={[
                        styles.removeSavedButton,
                        { borderColor: c.border },
                      ]}
                    >
                      {removingKey === key ? (
                        <ActivityIndicator size="small" color={c.error} />
                      ) : (
                        <Icon icon={Trash2} size={18} color={c.error} />
                      )}
                    </Pressable>
                  </View>
                );
              })
            )}
          </View>
        ) : null}
      </View>

      {!currentRoute ? (
        <View style={styles.empty}>
          <InlineMessage message={t('routes.tabEmpty')} tone="info" />

          <AccessibleButton
            label={t('routes.tabGoHome')}
            icon={Search}
            onPress={() =>
              navigation.navigate('MainTabs', { screen: 'Home' })
            }
          />
        </View>
      ) : null}

      <View
        style={[
          styles.searchSection,
          { borderColor: c.border, backgroundColor: c.surface },
        ]}
      >
        <AccessibleText
          variant="subtitle"
          weight="extrabold"
          style={styles.searchTitle}
        >
          {t('routes.lineSearchTitle')}
        </AccessibleText>

        <AccessibleTextInput
          label={t('routes.lineSearchLabel')}
          placeholder={t('routes.lineSearchPlaceholder')}
          icon={Search}
          value={lineQuery}
          onChangeText={setLineQuery}
          autoCapitalize="none"
          returnKeyType="search"
        />

        {lineLoading ? (
          <ActivityIndicator size="small" color={c.primary} />
        ) : null}

        {!lineLoading && lineQuery.trim() && lineResults.length === 0 ? (
          <AccessibleText variant="caption" color={c.textSecondary}>
            {t('routes.lineSearchEmpty')}
          </AccessibleText>
        ) : null}

        {lineResults.map((item) => (
          <Pressable
            key={item.lineId}
            onPress={() =>
              navigation.navigate('RouteDetail', {
                lineId: item.lineId,
                lineCode: item.lineCode,
                lineName: item.lineName,
              })
            }
            accessibilityRole="button"
            accessibilityLabel={`${item.lineCode}, ${item.lineName}. ${
              item.status === 'DELAYED'
                ? t('routes.lineDelayed', {
                    minutes: item.delayMinutes ?? 0,
                  })
                : item.status === 'UNAVAILABLE'
                  ? t('routes.lineUnavailable')
                  : t('routes.lineOperational')
            }`}
            style={[
              styles.lineResult,
              {
                borderColor: c.border,
                backgroundColor: c.surfaceAlt,
              },
            ]}
          >
            <RouteBadge code={item.lineCode} />

            <View style={styles.flex}>
              <AccessibleText variant="body" weight="extrabold">
                {item.lineName}
              </AccessibleText>

              <AccessibleText
                variant="caption"
                color={
                  item.status === 'DELAYED'
                    ? c.warning
                    : item.status === 'UNAVAILABLE'
                      ? c.error
                      : c.textSecondary
                }
              >
                {item.status === 'DELAYED'
                  ? t('routes.lineDelayed', {
                      minutes: item.delayMinutes ?? 0,
                    })
                  : item.status === 'UNAVAILABLE'
                    ? t('routes.lineUnavailable')
                    : t('routes.lineOperational')}
              </AccessibleText>
            </View>
          </Pressable>
        ))}
      </View>

      {currentRoute && isLoading ? (
        <View
          style={styles.empty}
          accessibilityRole="progressbar"
          accessibilityLabel={t('routes.searching')}
        >
          <ActivityIndicator size="large" color={c.primary} />
          <AccessibleText color={c.textSecondary}>
            {t('routes.searching')}
          </AccessibleText>
        </View>
      ) : null}

      {currentRoute && !isLoading && errorMessage ? (
        <InlineMessage message={errorMessage} tone="error" />
      ) : null}

      {currentRoute &&
      !isLoading &&
      !errorMessage &&
      options.length === 0 ? (
        <InlineMessage
          message={
            hasTransitData
              ? t('routes.notFound')
              : t('routes.noTransitData')
          }
          tone="warning"
        />
      ) : null}

      {options.length > 0 ? (
        <>
          <AccessibleText
            variant="caption"
            weight="bold"
            color={c.textSecondary}
            style={styles.count}
          >
            {t('routes.foundCountLabel', { count: options.length })}
          </AccessibleText>

          {options.map((option, index) => (
            <RouteOptionCard
              key={`${option.lineId}-${option.boardingStop.id}-${option.alightingStop.id}`}
              option={option}
              fastest={index === 0}
              onOpen={() => open(option)}
            />
          ))}
        </>
      ) : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  empty: {
    gap: 12,
    alignItems: 'stretch',
    paddingVertical: 8,
  },

  flex: {
    flex: 1,
  },

  offlineSection: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    marginBottom: 16,
    gap: 8,
  },

  offlineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  offlineIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },

  offlineList: {
    gap: 8,
    paddingTop: 4,
  },

  savedRouteCard: {
    minHeight: 68,
    borderWidth: 1,
    borderRadius: 14,
    padding: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  savedRouteMain: {
    flex: 1,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  removeSavedButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  searchSection: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    marginBottom: 16,
    gap: 8,
  },

  searchTitle: {
    marginBottom: 2,
  },

  lineResult: {
    minHeight: 60,
    borderWidth: 1,
    borderRadius: 14,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  count: {
    marginBottom: 12,
  },
});