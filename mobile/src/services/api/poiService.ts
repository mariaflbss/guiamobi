import { httpClient } from './httpClient';
import { Coordinates } from '../../types/location';

export type PoiCategory = 'hospital' | 'clinic' | 'pharmacy' | 'dentist' | 'bank' | 'atm' | 'supermarket' | 'square';

export interface PoiItem {
  id: string;
  category: PoiCategory;
  name: string | null;
  latitude: number;
  longitude: number;
}

export interface StopAddress {
  road: string | null;
  houseNumber: string | null;
  neighbourhood: string | null;
  displayName: string;
}

export const poiService = {
  /** Pontos de referência reais (OpenStreetMap via API). Vazio quando o OSM não tem nada na região. */
  async nearby(center: Coordinates, radius = 500, categories: PoiCategory[] = []): Promise<PoiItem[]> {
    const params = new URLSearchParams({
      lat: String(center.latitude),
      lng: String(center.longitude),
      radius: String(radius),
    });
    if (categories.length > 0) params.set('categories', categories.join(','));
    const { items } = await httpClient<{ items: PoiItem[] }>(`/poi/nearby?${params.toString()}`, { authenticated: true });
    return items;
  },

  /** Endereço real de um ponto (nome da rua/número quando o OSM tem). null = sem endereço conhecido. */
  async reverseAddress(point: Coordinates): Promise<StopAddress | null> {
    const params = new URLSearchParams({ lat: String(point.latitude), lng: String(point.longitude) });
    const { address } = await httpClient<{ address: StopAddress | null }>(`/geocode/reverse?${params.toString()}`, {
      authenticated: true,
    });
    return address;
  },
};
