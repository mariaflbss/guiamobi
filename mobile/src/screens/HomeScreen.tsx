import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bell, Hand, LocateFixed, MapPin, Search } from 'lucide-react-native';
import { AccessibleText } from '../components/AccessibleText';
import { AccessibleButton } from '../components/AccessibleButton';
import { Card } from '../components/Card';
import { FavoriteIcon } from '../components/FavoriteIcon';
import { Icon } from '../components/Icon';
import { InlineMessage } from '../components/InlineMessage';
import { RecentRouteRow } from '../components/RecentRouteRow';
import { SimpleHomeScreen } from './SimpleHomeScreen';
import { useAuth } from '../hooks/useAuth';
import { useAccessibility } from '../contexts/AccessibilityContext';
import { useRouteDraft, DraftPlace } from '../contexts/RouteDraftContext';
import { useConnectivity } from '../hooks/useConnectivity';
import { useLocationSearch } from '../hooks/useLocationSearch';
import { useFavorites } from '../hooks/useFavorites';
import { useSearchHistory } from '../hooks/useSearchHistory';
import { useStatusBarStyle } from '../hooks/useStatusBarStyle';
import { FavoritePlace, SearchHistoryItem } from '../types/favorites';
import { AppStackParamList } from '../navigation/types';
import { MIN_TOUCH_TARGET } from '../theme/theme';

type HomeNavigation = NativeStackNavigationProp<AppStackParamList>;

/**
 * Tela inicial (US05, mockup 04). Os campos de origem e destino abrem a
 * busca de endereço (PlaceSearch), que devolve um local real com latitude e
 * longitude - não há campo que aceite texto livre sem resultado. Integra
 * favoritos, últimas buscas (US07) e, no Modo Simples, troca por uma
 * interface reduzida.
 */
export function HomeScreen() {
  const { settings } = useAccessibility();
  if (settings.simpleMode) return <SimpleHomeScreen />;
  return <FullHome />;
}

function FullHome() {
  const { t } = useTranslation();
  const { theme, announce } = useAccessibility();
  const { user } = useAuth();
  const { isConnected } = useConnectivity();
  const { favorites } = useFavorites();
  const { history, lastRoute } = useSearchHistory();
  const navigation = useNavigation<HomeNavigation>();
  const insets = useSafeAreaInsets();
  const draft = useRouteDraft();
  const location = useLocationSearch();
  useStatusBarStyle('light');
  const c = theme.colors;

  const [locationDenied, setLocationDenied] = useState(false);
  const [missingMessage, setMissingMessage] = useState(false);

  const firstName = user?.name?.trim().split(' ')[0];
  const recent = history.slice(0, 3);

  async function handleUseCurrentLocation() {
    setLocationDenied(false);
    const result = await location.getCurrentLocation();

    if (!result) {
      setLocationDenied(true);
      announce(t('home.locationDenied'), { haptic: 'warning' });
      return;
    }

    draft.setOrigin(result);
    setMissingMessage(false);
    announce(t('home.locationFilled'), { haptic: 'success' });
  }

  function applyFavorite(kind: 'origin' | 'destination', favorite: FavoritePlace) {
    const place: DraftPlace = { label: favorite.nickname, latitude: favorite.latitude, longitude: favorite.longitude };
    if (kind === 'origin') draft.setOrigin(place);
    else draft.setDestination(place);
    announce(`${t('microphone.confirmPrefix')} ${t(kind === 'origin' ? 'home.origin' : 'home.destination')}: ${favorite.nickname}`);
  }

  function selectFavorite(favorite: FavoritePlace) {
    Alert.alert(t('home.chooseFieldTitle', { nickname: favorite.nickname }), undefined, [
      { text: t('home.asOrigin'), onPress: () => applyFavorite('origin', favorite) },
      { text: t('home.asDestination'), onPress: () => applyFavorite('destination', favorite) },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  }

  function applyRecent(item: SearchHistoryItem) {
    draft.setBoth(
      { label: item.originLabel, latitude: item.originLatitude, longitude: item.originLongitude },
      { label: item.destinationLabel, latitude: item.destinationLatitude, longitude: item.destinationLongitude }
    );
    setMissingMessage(false);
    announce(`${t('home.lastRouteSuggestion')}: ${item.originLabel} ${t('common.to')} ${item.destinationLabel}`);
  }

  function handleFindRoute() {
    if (!draft.origin || !draft.destination) {
      setMissingMessage(true);
      announce(t('home.needBothPlaces'), { haptic: 'warning' });
      return;
    }
    setMissingMessage(false);
    navigation.navigate('RoutesFound', { origin: draft.origin, destination: draft.destination });
  }

  return (
    <View style={[styles.flex, { backgroundColor: c.background }]}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={{ paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.header, { backgroundColor: c.primary, paddingTop: insets.top + 14 }]}>
          <View style={styles.greetingRow}>
            <View style={styles.greetingText}>
              <View style={styles.helloRow}>
                <AccessibleText variant="caption" weight="bold" color={c.onPrimaryMuted}>
                  {firstName ? t('home.greeting', { name: firstName }) : t('home.greetingNoName')}
                </AccessibleText>
                <Icon icon={Hand} size={14} color={c.onPrimaryMuted} />
              </View>
              <AccessibleText variant="heading" weight="extrabold" color={c.onPrimary} accessibilityRole="header">
                {t('home.whereTo')}
              </AccessibleText>
            </View>
            <Pressable
              onPress={() => Alert.alert(t('home.notifications'), t('home.noNotifications'))}
              accessibilityRole="button"
              accessibilityLabel={t('home.notifications')}
              style={[styles.bell, { backgroundColor: c.headerOverlay }]}
            >
              <Icon icon={Bell} size={22} color={c.onPrimary} />
            </Pressable>
          </View>
        </View>

        <Card style={styles.formCard}>
          {!isConnected ? <InlineMessage message={t('home.offlineSearch')} tone="warning" /> : null}
          {locationDenied ? <InlineMessage message={t('home.locationDenied')} tone="warning" /> : null}
          {missingMessage ? <InlineMessage message={t('home.needBothPlaces')} tone="warning" /> : null}

          <AccessibleText variant="label" color={c.textSecondary} style={styles.fieldLabel}>
            {t('home.origin').toUpperCase()}
          </AccessibleText>
          <PlaceField
            value={draft.origin?.label}
            placeholder={t('home.originPlaceholder')}
            label={t('home.origin')}
            hint={t('home.originHint')}
            onPress={() => navigation.navigate('PlaceSearch', { field: 'origin' })}
            leading={<View style={[styles.originDot, { backgroundColor: c.primary }]} />}
          />

          <View style={[styles.connector, { borderColor: c.borderStrong }]} accessible={false} importantForAccessibility="no-hide-descendants" />

          <AccessibleText variant="label" color={c.textSecondary} style={styles.fieldLabel}>
            {t('home.destination').toUpperCase()}
          </AccessibleText>
          <PlaceField
            value={draft.destination?.label}
            placeholder={t('home.destinationPlaceholder')}
            label={t('home.destination')}
            hint={t('home.destinationHint')}
            onPress={() => navigation.navigate('PlaceSearch', { field: 'destination' })}
            leading={<Icon icon={MapPin} size={18} color={c.success} />}
          />

          <AccessibleButton
            label={t('home.useCurrentLocation')}
            icon={LocateFixed}
            variant="soft"
            onPress={handleUseCurrentLocation}
            loading={location.isLocating}
            style={styles.locationButton}
          />

          <AccessibleButton label={t('home.findRoute')} icon={Search} onPress={handleFindRoute} size="lg" />
        </Card>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <AccessibleText variant="subtitle" weight="extrabold" accessibilityRole="header">
              {t('home.favorites')}
            </AccessibleText>
            <AccessibleButton
              label={t('home.seeAll')}
              variant="link"
              onPress={() => navigation.navigate('MainTabs', { screen: 'Favorites' })}
            />
          </View>

          {favorites.length === 0 ? (
            <AccessibleText variant="body" color={c.textSecondary}>
              {t('home.noFavorites')}
            </AccessibleText>
          ) : (
            <View style={styles.favoritesRow}>
              {favorites.slice(0, 3).map((favorite) => (
                <Pressable
                  key={favorite.id}
                  onPress={() => selectFavorite(favorite)}
                  accessibilityRole="button"
                  accessibilityLabel={`${favorite.nickname}. ${favorite.address}`}
                  accessibilityHint={t('favorites.selectHint')}
                  style={styles.favoriteItem}
                >
                  <Card style={styles.favoriteCard}>
                    <FavoriteIcon kind={favorite.kind} />
                    <AccessibleText variant="body" weight="extrabold" numberOfLines={1} style={styles.center}>
                      {favorite.nickname}
                    </AccessibleText>
                    <AccessibleText variant="caption" color={c.textSecondary} numberOfLines={1} style={styles.center}>
                      {favorite.address}
                    </AccessibleText>
                  </Card>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        {lastRoute ? (
          <View style={styles.section}>
            <AccessibleText variant="subtitle" weight="extrabold" accessibilityRole="header" style={styles.recentTitle}>
              {t('home.lastRouteTitle')}
            </AccessibleText>
            <RecentRouteRow
              item={lastRoute}
              onPress={() => applyRecent(lastRoute)}
              hint={t('home.lastRouteSuggestion')}
            />
          </View>
        ) : null}

        <View style={styles.section}>
          <AccessibleText variant="subtitle" weight="extrabold" accessibilityRole="header" style={styles.recentTitle}>
            {t('home.recentRoutes')}
          </AccessibleText>
          {recent.length === 0 ? (
            <AccessibleText variant="body" color={c.textSecondary}>
              {t('home.noRecentRoutes')}
            </AccessibleText>
          ) : (
            recent.map((item, index) => (
              <RecentRouteRow
                key={item.id}
                item={item}
                onPress={() => applyRecent(item)}
                hint={index === 0 ? t('home.lastRouteSuggestion') : undefined}
              />
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function PlaceField({
  value,
  placeholder,
  label,
  hint,
  onPress,
  leading,
}: {
  value?: string;
  placeholder: string;
  label: string;
  hint: string;
  onPress: () => void;
  leading: React.ReactNode;
}) {
  const { theme } = useAccessibility();
  const c = theme.colors;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${value ?? placeholder}`}
      accessibilityHint={hint}
      style={[styles.field, { backgroundColor: c.surface, borderColor: c.border, borderWidth: theme.highContrast ? 2 : 1 }]}
    >
      <View style={styles.fieldLeading} accessible={false} importantForAccessibility="no-hide-descendants">
        {leading}
      </View>
      <AccessibleText variant="body" weight="bold" color={value ? c.text : c.textSecondary} numberOfLines={2} style={styles.flex}>
        {value ?? placeholder}
      </AccessibleText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 72,
  },
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  greetingText: { flex: 1, gap: 2 },
  helloRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bell: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formCard: {
    marginHorizontal: 20,
    marginTop: -52,
    padding: 16,
    borderRadius: 22,
  },
  fieldLabel: { letterSpacing: 0.6, marginBottom: 6 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 54,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  fieldLeading: { width: 20, alignItems: 'center' },
  originDot: { width: 12, height: 12, borderRadius: 6 },
  connector: {
    height: 14,
    marginLeft: 23,
    marginVertical: 2,
    borderLeftWidth: 2,
    borderStyle: 'dotted',
    width: 0,
  },
  locationButton: { marginTop: 14, marginBottom: 10 },
  section: { paddingHorizontal: 20, marginTop: 22 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  recentTitle: { marginBottom: 10 },
  favoritesRow: { flexDirection: 'row', gap: 10 },
  favoriteItem: { flex: 1 },
  favoriteCard: {
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 14,
  },
  center: { textAlign: 'center' },
});
