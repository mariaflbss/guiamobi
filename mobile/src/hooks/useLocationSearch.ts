import { useCallback, useState } from 'react';
import { locationService } from '../services/location/locationService';
import { geocodingService } from '../services/location/geocodingService';
import { connectivityService } from '../services/connectivity/connectivityService';
import { PermissionStatus, PlaceSuggestion } from '../types/location';

export type SearchErrorKind = 'offline' | 'generic' | 'tooShort' | null;

/**
 * Hook central da US05 (origem e destino):
 * - solicita/consulta a permissão de GPS e trata negação;
 * - obtém a localização atual e converte em endereço legível;
 * - busca endereços de forma controlada: só quando o usuário confirma a
 *   pesquisa (botão ou tecla "buscar"), nunca a cada caractere digitado, e
 *   sempre verificando a conexão antes.
 */
export function useLocationSearch() {
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus>('undetermined');
  const [isLocating, setIsLocating] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchError, setSearchError] = useState<SearchErrorKind>(null);

  const getCurrentLocation = useCallback(async (): Promise<{
    label: string;
    latitude: number;
    longitude: number;
  } | null> => {
    setIsLocating(true);
    try {
      let status = await locationService.getPermissionStatus();

      if (status !== 'granted') {
        status = await locationService.requestPermission();
      }

      setPermissionStatus(status);

      if (status !== 'granted') {
        return null; // a tela exibe home.locationDenied
      }

      const coordinates = await locationService.getCurrentPosition();
      const address = await locationService.reverseGeocode(coordinates);

      return {
        label: address ?? 'Minha localização atual',
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
      };
    } catch {
      return null;
    } finally {
      setIsLocating(false);
    }
  }, []);

  const searchAddress = useCallback(async (query: string) => {
    setSearchError(null);

    if (query.trim().length < 3) {
      setSuggestions([]);
      setHasSearched(false);
      setSearchError('tooShort');
      return;
    }

    const isOnline = await connectivityService.isConnected();
    if (!isOnline) {
      setSuggestions([]);
      setHasSearched(false);
      setSearchError('offline');
      return;
    }

    setIsSearching(true);
    try {
      const results = await geocodingService.searchAddress(query);
      setSuggestions(results);
      setHasSearched(true);
    } catch {
      setSearchError('generic');
      setSuggestions([]);
      setHasSearched(false);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const clearSuggestions = useCallback(() => {
    setSuggestions([]);
    setHasSearched(false);
    setSearchError(null);
  }, []);

  return {
    permissionStatus,
    isLocating,
    isSearching,
    suggestions,
    hasSearched,
    searchError,
    getCurrentLocation,
    searchAddress,
    clearSuggestions,
  };
}
