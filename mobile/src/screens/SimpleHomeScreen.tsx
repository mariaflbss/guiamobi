import React, { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Bus, Mic, Plus } from 'lucide-react-native';
import { AccessibleText } from '../components/AccessibleText';
import { AccessibleButton } from '../components/AccessibleButton';
import { Card } from '../components/Card';
import { FavoriteIcon, FAVORITE_KIND_STYLE } from '../components/FavoriteIcon';
import { Icon } from '../components/Icon';
import { InlineMessage } from '../components/InlineMessage';
import { ScreenContainer } from '../components/ScreenContainer';
import { toneColors } from '../components/SettingCard';
import { useAccessibility } from '../contexts/AccessibilityContext';
import { useRouteDraft } from '../contexts/RouteDraftContext';
import { useFavorites } from '../hooks/useFavorites';
import { useSearchHistory } from '../hooks/useSearchHistory';
import { useLocationSearch } from '../hooks/useLocationSearch';
import { useStatusBarStyle } from '../hooks/useStatusBarStyle';
import { AppStackParamList } from '../navigation/types';
import { FavoritePlace } from '../types/favorites';
import { MIN_TOUCH_TARGET } from '../theme/theme';

type Nav = NativeStackNavigationProp<AppStackParamList>;

const MAX_OPTIONS = 4;

/**
 * Modo Simples (mockup 13): interface reduzida. Sem barra de abas, sem
 * formulários e sem listas longas - só até quatro destinos grandes (seus
 * favoritos) e "Falar o destino". Escolher um destino usa a localização
 * atual como origem e abre a melhor rota. O selo "SIMPLES" e o link do
 * rodapé permitem voltar à interface completa.
 */
export function SimpleHomeScreen() {
  const { t } = useTranslation();
  const { theme, updateSettings, announce } = useAccessibility();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { favorites } = useFavorites();
  const { lastRoute } = useSearchHistory();
  const location = useLocationSearch();
  const draft = useRouteDraft();
  const [locationDenied, setLocationDenied] = useState(false);
  const waitingForSpokenDestination = useRef(false);
  useStatusBarStyle('light');
  const c = theme.colors;

  async function goTo(destination: { label: string; latitude: number; longitude: number }) {
    setLocationDenied(false);
    const origin = await location.getCurrentLocation();
    if (!origin) {
      setLocationDenied(true);
      announce(t('home.locationDenied'), { haptic: 'warning' });
      return;
    }
    navigation.navigate('RoutesFound', { origin, destination });
  }

  // Depois de "Falar o destino" (busca de endereço), segue direto para as rotas
  useEffect(() => {
    if (waitingForSpokenDestination.current && draft.destination) {
      waitingForSpokenDestination.current = false;
      goTo(draft.destination);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.destination]);

  function speakDestination() {
    waitingForSpokenDestination.current = true;
    draft.setDestination(null);
    navigation.navigate('PlaceSearch', { field: 'destination' });
  }

  function exitSimpleMode() {
    Alert.alert(t('simpleMode.exitConfirmTitle'), t('simpleMode.exitConfirmMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('simpleMode.exit'), onPress: () => updateSettings({ simpleMode: false }) },
    ]);
  }

  function optionColors(favorite: FavoritePlace) {
    const style = FAVORITE_KIND_STYLE[favorite.kind] ?? FAVORITE_KIND_STYLE.other;
    return toneColors(style.tone, c);
  }

  return (
    <ScreenContainer
      scroll
      backgroundColor={c.primarySoft}
      header={
        <View style={[styles.header, { backgroundColor: c.primary, paddingTop: insets.top + 14 }]}>
          <View style={styles.flex}>
            <AccessibleText variant="heading" weight="extrabold" color={c.onPrimary} accessibilityRole="header">
              {t('simpleMode.title')}
            </AccessibleText>
            <AccessibleText variant="caption" weight="semibold" color={c.onPrimaryMuted}>
              {t('simpleMode.subtitle')}
            </AccessibleText>
          </View>
          <Pressable
            onPress={exitSimpleMode}
            accessibilityRole="button"
            accessibilityLabel={t('simpleMode.badge')}
            accessibilityHint={t('simpleMode.badgeHint')}
            style={[styles.badge, { backgroundColor: c.headerOverlay }]}
          >
            <AccessibleText variant="label" weight="extrabold" color={c.onPrimary}>
              {t('simpleMode.badge')}
            </AccessibleText>
          </Pressable>
        </View>
      }
      contentStyle={styles.content}
    >
      <View style={[styles.logo, { backgroundColor: c.primary }]} accessible={false} importantForAccessibility="no-hide-descendants">
        <Icon icon={Bus} size={42} color="#FFFFFF" strokeWidth={1.8} />
      </View>
      <AccessibleText variant="title" weight="extrabold" style={styles.center} accessibilityRole="header">
        {t('simpleMode.whereTo')}
      </AccessibleText>
      <AccessibleText variant="body" weight="semibold" color={c.textSecondary} style={styles.center}>
        {t('simpleMode.chooseOption')}
      </AccessibleText>

      {locationDenied ? <InlineMessage message={t('home.locationDenied')} tone="warning" /> : null}
      {location.isLocating ? <InlineMessage message={t('simpleMode.locating')} tone="info" /> : null}

      {lastRoute ? (
        <Pressable
          onPress={() => {
            const origin = { label: lastRoute.originLabel, latitude: lastRoute.originLatitude, longitude: lastRoute.originLongitude };
            const destination = {
              label: lastRoute.destinationLabel,
              latitude: lastRoute.destinationLatitude,
              longitude: lastRoute.destinationLongitude,
            };
            navigation.navigate('RoutesFound', { origin, destination });
            announce(`${t('home.lastRouteSuggestion')}: ${lastRoute.originLabel} ${t('common.to')} ${lastRoute.destinationLabel}`);
          }}
          accessibilityRole="button"
          accessibilityLabel={`${t('home.lastRouteTitle')}: ${lastRoute.originLabel} ${t('common.to')} ${lastRoute.destinationLabel}`}
          accessibilityHint={t('home.lastRouteSuggestion')}
        >
          <Card style={styles.lastRouteCard}>
            <AccessibleText variant="caption" weight="bold" color={c.textSecondary}>
              {t('home.lastRouteTitle')}
            </AccessibleText>
            <AccessibleText variant="body" weight="extrabold" numberOfLines={2}>
              {lastRoute.originLabel} → {lastRoute.destinationLabel}
            </AccessibleText>
          </Card>
        </Pressable>
      ) : null}

      <View style={styles.options}>
        {favorites.length === 0 ? (
          <>
            <InlineMessage message={t('simpleMode.noFavorites')} tone="info" />
            <AccessibleButton label={t('simpleMode.addPlaces')} icon={Plus} onPress={() => navigation.navigate('AddFavorite')} size="lg" />
          </>
        ) : (
          favorites.slice(0, MAX_OPTIONS).map((favorite) => {
            const { bg, fg } = optionColors(favorite);
            return (
              <Pressable
                key={favorite.id}
                onPress={() => goTo({ label: favorite.nickname, latitude: favorite.latitude, longitude: favorite.longitude })}
                disabled={location.isLocating}
                accessibilityRole="button"
                accessibilityLabel={t('simpleMode.goToOption', { name: favorite.nickname })}
                accessibilityState={{ disabled: location.isLocating, busy: location.isLocating }}
              >
                <Card style={[styles.option, { borderColor: fg, opacity: location.isLocating ? 0.6 : 1 }]}>
                  <FavoriteIcon kind={favorite.kind} size={52} />
                  <AccessibleText variant="heading" weight="extrabold" style={styles.flex}>
                    {favorite.nickname}
                  </AccessibleText>
                  <View style={[styles.arrow, { backgroundColor: bg }]} accessible={false} importantForAccessibility="no-hide-descendants">
                    <Icon icon={ArrowRight} size={20} color={fg} />
                  </View>
                </Card>
              </Pressable>
            );
          })
        )}

        <Pressable
          onPress={speakDestination}
          accessibilityRole="button"
          accessibilityLabel={t('simpleMode.speakDestination')}
          style={[styles.speak, { borderColor: c.borderStrong }]}
        >
          <Icon icon={Mic} size={22} color={c.textSecondary} />
          <AccessibleText variant="subtitle" weight="bold" color={c.textSecondary}>
            {t('simpleMode.speakDestination')}
          </AccessibleText>
        </Pressable>
      </View>

      <AccessibleButton label={t('simpleMode.exit')} variant="link" onPress={exitSimpleMode} style={styles.exit} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingBottom: 16 },
  badge: { minHeight: MIN_TOUCH_TARGET, paddingHorizontal: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  content: { alignItems: 'stretch' },
  logo: { width: 84, height: 84, borderRadius: 24, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginTop: 8, marginBottom: 16 },
  center: { textAlign: 'center' },
  lastRouteCard: { gap: 4, padding: 14, marginTop: 18 },
  options: { marginTop: 22, gap: 14 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderWidth: 2, borderRadius: 22, minHeight: 84 },
  arrow: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  speak: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 72,
    borderRadius: 22,
    borderWidth: 2,
    borderStyle: 'dashed',
  },
  exit: { marginTop: 18, alignSelf: 'center' },
});
