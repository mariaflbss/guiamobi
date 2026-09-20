import { httpClient } from '../api/httpClient';
import { PlaceSuggestion } from '../../types/location';

/**
 * Busca de endereços (US05). A consulta passa pela API do projeto, que
 * conversa com o OpenStreetMap/Nominatim respeitando a política de uso
 * (1 requisição por segundo, User-Agent identificado, cache) e prioriza São
 * José dos Campos e o Vale do Paraíba. O app nunca chama o Nominatim
 * diretamente. É responsabilidade da tela verificar a conectividade antes.
 */
export const geocodingService = {
  async searchAddress(query: string): Promise<PlaceSuggestion[]> {
    const text = query.trim();
    if (text.length < 3) return [];

    const params = new URLSearchParams({ q: text });
    const { results } = await httpClient<{ results: PlaceSuggestion[] }>(`/geocode/search?${params.toString()}`, {
      authenticated: true,
    });
    return results;
  },
};
