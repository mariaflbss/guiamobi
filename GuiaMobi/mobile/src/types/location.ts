// Tipos relacionados a localização e busca de origem/destino (US05)

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface PlaceSuggestion {
  id: string;
  label: string; // texto principal (ex.: nome do local)
  secondaryLabel?: string; // texto secundário (ex.: endereço completo)
  coordinates: Coordinates;
}

export type PermissionStatus = 'granted' | 'denied' | 'undetermined';
