import React, { useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { LocateFixed, MapPin, Search } from 'lucide-react-native';
import { ScreenContainer } from '../components/ScreenContainer';
import { ScreenHeader } from '../components/ScreenHeader';
import { AccessibleText } from '../components/AccessibleText';
import { AccessibleTextInput } from '../components/AccessibleTextInput';
import { AccessibleButton } from '../components/AccessibleButton';
import { InlineMessage } from '../components/InlineMessage';
import { MicrophoneButton } from '../components/MicrophoneButton';
import { Card } from '../components/Card';
import { FavoriteIcon } from '../components/FavoriteIcon';
import { Icon } from '../components/Icon';
import { useAccessibility } from '../contexts/AccessibilityContext';
import { DraftPlace, useRouteDraft } from '../contexts/RouteDraftContext';
import { useLocationSearch } from '../hooks/useLocationSearch';
import { useFavorites } from '../hooks/useFavorites';
import { useStatusBarStyle } from '../hooks/useStatusBarStyle';
import { PlaceSuggestion } from '../types/location';
import { AppStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'PlaceSearch'>;

/**
 * Busca de endereço de origem/destino (US05), no estilo dos apps de
 * transporte: o usuário toca no campo, digita, toca em "Buscar", recebe
 * resultados reais e escolhe um - só então o sistema obtém latitude e
 * longitude. A busca é sempre explícita (botão ou tecla "buscar"), nunca a
 * cada letra digitada, respeitando os limites do serviço de geocodificação.
 */
export function PlaceSearchScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const { theme, announce } = useAccessibility();
  const { favorites } = useFavorites();
  const draft = useRouteDraft();
  const search = useLocationSearch();
  const inputRef = useRef<TextInput>(null);
  useStatusBarStyle('light');
  const c = theme.colors;

  const { field } = route.params;
  const isOrigin = field === 'origin';
  const [query, setQuery] = useState('');
  const [locationDenied, setLocationDenied] = useState(false);

  function commit(place: DraftPlace) {
    if (isOrigin) draft.setOrigin(place);
    else draft.setDestination(place);
    announce(t('placeSearch.selected', { label: place.label }), { haptic: 'success' });
    navigation.goBack();
  }

  function selectSuggestion(item: PlaceSuggestion) {
    commit({ label: item.label, latitude: item.coordinates.latitude, longitude: item.coordinates.longitude });
  }

  async function useMyLocation() {
    setLocationDenied(false);
    const result = await search.getCurrentLocation();
    if (!result) {
      setLocationDenied(true);
      announce(t('home.locationDenied'), { haptic: 'warning' });
      return;
    }
    commit(result);
  }

  const errorText =
    search.searchError === 'offline'
      ? t('placeSearch.offline')
      : search.searchError === 'tooShort'
      ? t('placeSearch.tooShort')
      : search.searchError === 'generic'
      ? t('placeSearch.genericError')
      : null;

  return (
    <ScreenContainer
      padding={0}
      header={
        <ScreenHeader
          title={t(isOrigin ? 'placeSearch.titleOrigin' : 'placeSearch.titleDestination')}
          subtitle={t('placeSearch.subtitle')}
          onBack={() => navigation.goBack()}
        />
      }
    >
      <FlatList
        data={search.suggestions}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View>
            <View style={styles.searchRow}>
              <View style={styles.flex}>
                <AccessibleTextInput
                  ref={inputRef}
                  label={t(isOrigin ? 'home.origin' : 'home.destination')}
                  placeholder={t('placeSearch.placeholder')}
                  icon={Search}
                  value={query}
                  onChangeText={setQuery}
                  autoFocus
                  returnKeyType="search"
                  onSubmitEditing={() => search.searchAddress(query)}
                />
              </View>
              <View style={styles.micWrap}>
                <MicrophoneButton onPress={() => inputRef.current?.focus()} />
              </View>
            </View>

            <AccessibleButton
              label={t('placeSearch.search')}
              icon={Search}
              onPress={() => search.searchAddress(query)}
              loading={search.isSearching}
              accessibilityHint={t('placeSearch.searchHint')}
            />

            {errorText ? (
              <View style={styles.message}>
                <InlineMessage message={errorText} tone={search.searchError === 'generic' ? 'error' : 'warning'} />
              </View>
            ) : null}
            {locationDenied ? (
              <View style={styles.message}>
                <InlineMessage message={t('home.locationDenied')} tone="warning" />
              </View>
            ) : null}

            {isOrigin ? (
              <AccessibleButton
                label={t('home.useCurrentLocation')}
                icon={LocateFixed}
                variant="soft"
                onPress={useMyLocation}
                loading={search.isLocating}
                style={styles.locationButton}
              />
            ) : null}

            {search.suggestions.length === 0 && !search.isSearching && !errorText ? (
              search.hasSearched ? (
                <View style={styles.message}>
                  <InlineMessage message={t('placeSearch.noResults')} tone="info" />
                </View>
              ) : (
                <>
                  <AccessibleText variant="body" color={c.textSecondary} style={styles.hint}>
                    {t('placeSearch.initialHint')}
                  </AccessibleText>
                  {favorites.length > 0 ? (
                    <View style={styles.favorites}>
                      <AccessibleText variant="subtitle" weight="extrabold" accessibilityRole="header" style={styles.sectionTitle}>
                        {t('home.favorites')}
                      </AccessibleText>
                      {favorites.map((favorite) => (
                        <Pressable
                          key={favorite.id}
                          onPress={() =>
                            commit({ label: favorite.nickname, latitude: favorite.latitude, longitude: favorite.longitude })
                          }
                          accessibilityRole="button"
                          accessibilityLabel={`${favorite.nickname}. ${favorite.address}`}
                        >
                          <Card style={styles.resultCard}>
                            <FavoriteIcon kind={favorite.kind} size={40} />
                            <View style={styles.flex}>
                              <AccessibleText variant="body" weight="extrabold">
                                {favorite.nickname}
                              </AccessibleText>
                              <AccessibleText variant="caption" color={c.textSecondary} numberOfLines={2}>
                                {favorite.address}
                              </AccessibleText>
                            </View>
                          </Card>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                </>
              )
            ) : null}

            {search.suggestions.length > 0 ? (
              <AccessibleText variant="subtitle" weight="extrabold" accessibilityRole="header" style={styles.sectionTitle}>
                {t('placeSearch.results')}
              </AccessibleText>
            ) : null}
            {search.isSearching ? <ActivityIndicator color={c.primary} style={styles.loading} /> : null}
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => selectSuggestion(item)}
            accessibilityRole="button"
            accessibilityLabel={t('placeSearch.selectResult', { label: item.secondaryLabel ?? item.label })}
          >
            <Card style={styles.resultCard}>
              <View style={[styles.pinTile, { backgroundColor: c.primarySoft }]} accessible={false} importantForAccessibility="no-hide-descendants">
                <Icon icon={MapPin} size={20} color={c.primary} />
              </View>
              <View style={styles.flex}>
                <AccessibleText variant="body" weight="extrabold" numberOfLines={2}>
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
        )}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { padding: 20, paddingBottom: 40 },
  searchRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  micWrap: { marginBottom: 16 },
  message: { marginTop: 12 },
  locationButton: { marginTop: 12 },
  hint: { marginTop: 16 },
  favorites: { marginTop: 16 },
  sectionTitle: { marginTop: 18, marginBottom: 10 },
  resultCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    marginBottom: 10,
  },
  pinTile: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loading: { marginTop: 18 },
});
