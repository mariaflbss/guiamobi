import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { CircleCheck, MapPin, Search, Tag } from 'lucide-react-native';
import { ScreenContainer } from '../components/ScreenContainer';
import { ScreenHeader } from '../components/ScreenHeader';
import { AccessibleText } from '../components/AccessibleText';
import { AccessibleTextInput } from '../components/AccessibleTextInput';
import { AccessibleButton } from '../components/AccessibleButton';
import { InlineMessage } from '../components/InlineMessage';
import { Card } from '../components/Card';
import { FavoriteIcon } from '../components/FavoriteIcon';
import { Icon } from '../components/Icon';
import { useAccessibility } from '../contexts/AccessibilityContext';
import { useFavorites } from '../hooks/useFavorites';
import { useLocationSearch } from '../hooks/useLocationSearch';
import { useStatusBarStyle } from '../hooks/useStatusBarStyle';
import { FavoriteKind } from '../types/favorites';
import { PlaceSuggestion } from '../types/location';
import { AppStackParamList } from '../navigation/types';
import { MIN_TOUCH_TARGET } from '../theme/theme';

type Props = NativeStackScreenProps<AppStackParamList, 'AddFavorite'>;

const KINDS: FavoriteKind[] = ['home', 'school', 'work', 'health', 'other'];

/**
 * Novo local favorito (US07): apelido, tipo (define ícone e cor) e endereço
 * escolhido entre resultados reais da busca (com latitude/longitude), nunca
 * um texto livre sem verificação. Persiste no SQLite do aparelho.
 */
export function AddFavoriteScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const { theme, announce } = useAccessibility();
  const { createFavorite, isCreating } = useFavorites();
  const search = useLocationSearch();
  useStatusBarStyle('light');
  const c = theme.colors;

  const [nickname, setNickname] = useState('');
  const [kind, setKind] = useState<FavoriteKind>('home');
  const [query, setQuery] = useState('');
  const [place, setPlace] = useState<PlaceSuggestion | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function fail(message: string) {
    setErrorMessage(message);
    announce(message, { haptic: 'error' });
  }

  function pick(item: PlaceSuggestion) {
    setPlace(item);
    setQuery(item.secondaryLabel ?? item.label);
    search.clearSuggestions();
    announce(`${t('favorites.address')}: ${item.label}`);
  }

  async function save() {
    setErrorMessage(null);
    if (nickname.trim().length === 0) return fail(t('auth.errors.shortName'));
    if (!place) return fail(t('favorites.chooseAddress'));

    await createFavorite({
      nickname: nickname.trim(),
      address: place.secondaryLabel ?? place.label,
      coordinates: place.coordinates,
      kind,
    });
    announce(t('favorites.saved'), { haptic: 'success' });
    navigation.goBack();
  }

  const searchError =
    search.searchError === 'offline'
      ? t('placeSearch.offline')
      : search.searchError === 'tooShort'
      ? t('placeSearch.tooShort')
      : search.searchError === 'generic'
      ? t('placeSearch.genericError')
      : null;

  return (
    <ScreenContainer
      scroll
      header={<ScreenHeader title={t('favorites.addPlaceTitle')} subtitle={t('favorites.subtitle')} onBack={() => navigation.goBack()} />}
    >
      {errorMessage ? <InlineMessage message={errorMessage} tone="error" /> : null}

      <AccessibleTextInput
        label={t('favorites.nickname')}
        placeholder={t('favorites.nicknamePlaceholder')}
        icon={Tag}
        value={nickname}
        onChangeText={setNickname}
      />

      <AccessibleText variant="caption" weight="bold" color={c.textSecondary} style={styles.label}>
        {t('favorites.kind')}
      </AccessibleText>
      <View style={styles.kinds} accessibilityRole="radiogroup" accessibilityLabel={t('favorites.kind')}>
        {KINDS.map((item) => {
          const selected = item === kind;
          return (
            <Pressable
              key={item}
              onPress={() => setKind(item)}
              accessibilityRole="radio"
              accessibilityLabel={t(`favorites.kinds.${item}`)}
              accessibilityState={{ selected, checked: selected }}
              style={[
                styles.kind,
                { borderColor: selected ? c.primary : c.border, backgroundColor: selected ? c.primarySoft : c.surface, borderWidth: selected ? 2 : 1 },
              ]}
            >
              <FavoriteIcon kind={item} size={36} />
              <AccessibleText variant="caption" weight={selected ? 'extrabold' : 'semibold'} color={selected ? c.primary : c.text}>
                {t(`favorites.kinds.${item}`)}
              </AccessibleText>
            </Pressable>
          );
        })}
      </View>

      <AccessibleTextInput
        label={t('favorites.address')}
        placeholder={t('favorites.addressPlaceholder')}
        icon={MapPin}
        value={query}
        onChangeText={(text) => {
          setQuery(text);
          setPlace(null);
        }}
        returnKeyType="search"
        onSubmitEditing={() => search.searchAddress(query)}
      />
      <AccessibleButton label={t('favorites.searchAddress')} icon={Search} variant="secondary" onPress={() => search.searchAddress(query)} loading={search.isSearching} />

      {searchError ? (
        <View style={styles.gap}>
          <InlineMessage message={searchError} tone={search.searchError === 'generic' ? 'error' : 'warning'} />
        </View>
      ) : null}
      {search.hasSearched && search.suggestions.length === 0 ? (
        <View style={styles.gap}>
          <InlineMessage message={t('placeSearch.noResults')} tone="info" />
        </View>
      ) : null}

      {search.suggestions.map((item) => (
        <Pressable
          key={item.id}
          onPress={() => pick(item)}
          accessibilityRole="button"
          accessibilityLabel={t('placeSearch.selectResult', { label: item.secondaryLabel ?? item.label })}
        >
          <Card style={styles.result}>
            <Icon icon={MapPin} size={20} color={c.primary} />
            <View style={styles.flex}>
              <AccessibleText variant="body" weight="extrabold">
                {item.label}
              </AccessibleText>
              {item.secondaryLabel ? (
                <AccessibleText variant="caption" color={c.textSecondary} numberOfLines={3}>
                  {item.secondaryLabel}
                </AccessibleText>
              ) : null}
            </View>
          </Card>
        </Pressable>
      ))}

      {place ? (
        <View style={[styles.selected, { backgroundColor: c.successBg, borderColor: c.success }]} accessibilityLiveRegion="polite">
          <Icon icon={CircleCheck} size={18} color={c.success} />
          <AccessibleText variant="caption" weight="bold" color={c.successDark} style={styles.flex}>
            {place.secondaryLabel ?? place.label}
          </AccessibleText>
        </View>
      ) : null}

      <AccessibleButton label={t('common.save')} onPress={save} loading={isCreating} size="lg" style={styles.save} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  label: { marginBottom: 6 },
  kinds: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 },
  kind: {
    alignItems: 'center',
    gap: 4,
    minWidth: 76,
    minHeight: MIN_TOUCH_TARGET + 24,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 14,
  },
  gap: { marginTop: 12 },
  result: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, marginTop: 10 },
  selected: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 12 },
  save: { marginTop: 20 },
});
